import esi from 'cloudflare-esi';
import yn from 'yn';
import {
	toAscii,
	filterEmptyAndDuplicates,
	encodeSearchParams,
	removeTrailingSlashes,
	verifyRequest,
	createHmacVerifier,
	htmlResponse,
} from './utils';
import { Toucan } from 'toucan-js';

export default class Worker {
	private request: Request;
	private env: Env;
	private ctx: ExecutionContext;
	private sentry: Toucan;
	private kvData: KeyValueData;

	static async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		try {
			const kvData = await Worker.getKvDataForHostname(url.hostname, env);
			return new Worker(request, env, ctx, kvData).fetch();
		} catch (e) {
			return htmlResponse('Nothing here yet…', {
				status: 404,
			});
		}
	}

	static async getKvDataForHostname(hostname: string, env: Env): Promise<KeyValueData> {
		const kvData: KeyValueData | null = await env.HOSTS.get(hostname, { type: 'json' });

		if (!kvData) {
			throw new Error(`No gateway data found for hostname: ${hostname}`);
		}

		return kvData;
	}

	private constructor(request: Request, env: Env, ctx: ExecutionContext, kvData: KeyValueData) {
		this.request = request;
		this.env = env;
		this.ctx = ctx;
		this.request = request;
		this.kvData = kvData;
		this.sentry = new Toucan({
			dsn: env.SENTRY_DSN,
			environment: env.ENVIRONMENT,
			context: ctx,
			request,
			enabled: yn(env.SENTRY_DSN),
		});
	}

	async fetch(): Promise<Response> {
		try {
			return (await this.verifyRequest()) || (await this.fetchOrigin());
		} catch (e) {
			this.sentry.captureException(e);
			console.error(e);

			return htmlResponse('Gateway Error', {
				status: 500,
			});
		}
	}

	private async verifyRequest(): Promise<Response | null> {
		const sharedSecret = this.kvData.signingKey ?? '';
		const signingKeys = new Map();
		signingKeys.set('hmac', createHmacVerifier(sharedSecret));

		if (!(await verifyRequest(this.request, signingKeys))) {
			return new Response('Unauthorized', {
				status: 401,
			});
		}

		return null;
	}

	private async purgeByTag(tag: string): Promise<Response> {
		const tags = tag
			.split(',')
			.map(value => toAscii(value).trim())
			.filter(filterEmptyAndDuplicates)
			.slice(0, 30);

		if (!tags.length) {
			return new Response('No valid tags to purge', {
				status: 400,
			});
		}

		console.log('Purging tags:', tags);

		return this.fetchPurgeRequest({ tags });
	}

	private async purgeByUrl(url: string): Promise<Response> {
		const urls = await Promise.all(
			url
				.split(',')
				.filter(filterEmptyAndDuplicates)
				.slice(0, 500)
				.map(async (url: string) => {
					const originRequest = await this.createOriginRequest(url);

					return {
						url: originRequest.url,
						headers: {
							'X-Forwarded-Host': originRequest.headers.get('X-Forwarded-Host'),
						},
					};
				})
		);

		if (!urls.length) {
			return new Response('No valid URLs to purge', {
				status: 400,
			});
		}

		console.log('Purging URLs:', urls);

		return this.fetchPurgeRequest({ files: urls });
	}

	private async purgeByPrefix(prefix: string): Promise<Response> {
		const prefixes = prefix
			.split(',')
			.map(value => {
				const prefix = toAscii(value).trim();

				if (!prefix) {
					return null;
				}

				// Allows the prefix to be a full URL or just a path
				const url = new URL(prefix, `https://${this.kvData.originHostname}`);
				url.host = this.kvData.originHostname;

				// https://developers.cloudflare.com/cache/how-to/purge-cache/purge_by_prefix/
				return url.host + url.pathname;
			})
			.filter(filterEmptyAndDuplicates)
			.slice(0, 30);

		if (!prefixes.length) {
			return new Response('No valid prefixes to purge', {
				status: 400,
			});
		}

		console.log('Purging prefixes:', prefixes);

		return this.fetchPurgeRequest({ prefixes });
	}

	private async fetchPurgeRequest(body: object | null): Promise<Response> {
		const url = `https://api.cloudflare.com/client/v4/zones/${this.env.CF_ZONE_ID}/purge_cache`;
		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.env.CF_PURGE_API_TOKEN}`,
			},
		};

		Object.assign(options, {
			body: JSON.stringify(body),
		});

		const response = await fetch(url, options);

		if (!response.ok) {
			const body = await response.clone().json();

			this.sentry.setExtra('apiResponse', {
				status: response.status,
				body,
			});

			this.sentry.captureException('Failed to purge cache');
		}

		return response;
	}

	private async fetchEsiRequest(requestInfo: RequestInfo, ctx: Request[]): Promise<Response> {
		const request = new Request(requestInfo);
		const isOriginRequest = this.kvData.hostname === new URL(request.url).hostname;

		// Only include headers from root request if this is a request to origin
		if (isOriginRequest) {
			const originRequest = await this.createOriginRequest(request);
			const headers = new Headers(ctx[0]?.headers ?? undefined);
			originRequest.headers.forEach((value, key) => headers.set(key, value));

			return fetch(originRequest, { headers });
		}

		return fetch(request);
	}

	private async createOriginRequest(requestInfo: RequestInfo): Promise<Request> {
		const request = new Request(requestInfo);
		const requestUrl = new URL(request.url);
		const headers = new Headers(request.headers);
		const originRequestUrl = new URL(`https://${this.kvData.originHostname}`);

		originRequestUrl.pathname = requestUrl.pathname;
		originRequestUrl.search = encodeSearchParams(requestUrl.searchParams);

		headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
		headers.set('X-Forwarded-Host', requestUrl.hostname);

		return new Request(originRequestUrl, {
			redirect: 'manual',
			headers,
			method: request.method,
			body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
			cf: {
				cacheEverything: true,
				cacheTags: [
					this.kvData.environmentId,
					this.kvData.hostname,
					removeTrailingSlashes(`${this.kvData.environmentId}:${originRequestUrl.pathname}`),
				],
			},
		});
	}

	private async fetchOrigin(): Promise<Response> {
		const parser = new esi(undefined, undefined, this.fetchEsiRequest.bind(this));
		const originResponse = await parser.parse(this.request);
		const response = new Response(originResponse.body, originResponse);
		const purgePrefixFromResponse = originResponse.headers.get('Cache-Purge-Prefix');
		const purgeTagFromResponse = originResponse.headers.get('Cache-Purge-Tag');
		const purgeUrlFromResponse = originResponse.headers.get('Cache-Purge-URL');

		// DO NOT use `await` here, as we don't want the purge request to block returning the response.
		if (purgePrefixFromResponse) {
			this.ctx.waitUntil(this.purgeByPrefix(purgePrefixFromResponse));
		}

		if (purgeTagFromResponse) {
			this.ctx.waitUntil(this.purgeByTag(purgeTagFromResponse));
		}

		if (purgeUrlFromResponse) {
			this.ctx.waitUntil(this.purgeByUrl(purgeUrlFromResponse));
		}

		return response;
	}
}
