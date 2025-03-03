import { env, fetchMock } from 'cloudflare:test';
import { Worker } from '../dist/index';

export async function interceptUrl(url: string | URL, options: MockClientOptions = {}) {
	url = new URL(url);

	const { hostname, pathname, searchParams } = url;
	const { originHostname } = await Worker.getKvDataForHostname(hostname, env);

	options = Object.assign(
		{
			path: pathname,
			query: Object.fromEntries(searchParams.entries()),
		},
		options
	);

	return fetchMock.get(`https://${originHostname}`).intercept(options);
}
