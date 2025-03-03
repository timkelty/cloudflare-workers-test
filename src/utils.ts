import page from './templates/page.html';
import { render } from 'workers-hbs';
import { cavage } from 'http-message-signatures';

export function filterEmptyAndDuplicates(value: any, index: number, array: any[]) {
	return value && array.indexOf(value) === index;
}

// https://stackoverflow.com/a/19828943/935398
export function toAscii(input: string, maxCharCode = 127) {
	var output = '';
	for (var i = 0; i < input.length; i++) {
		if (input.charCodeAt(i) <= maxCharCode) {
			output += input.charAt(i);
		}
	}
	return output;
}

export async function createHmacVerifier(sharedSecret: string, id = 'hmac') {
	return {
		id,
		algs: ['hmac-sha256'],
		async verify(
			data: ArrayBuffer | ArrayBufferView,
			signature: ArrayBuffer | ArrayBufferView,
			parameters: any
		) {
			const key = await crypto.subtle.importKey(
				'raw',
				Buffer.from(sharedSecret),
				{
					name: 'HMAC',
					hash: 'SHA-256',
				},
				false,
				['verify']
			);
			return crypto.subtle.verify('HMAC', key, signature, data);
		},
	};
}

export async function verifyRequest(request: Request, keys: Map<any, any>) {
	return cavage.verifyMessage(
		{
			async keyLookup(params) {
				return keys.get(params.keyid);
			},
		},
		{
			method: request.method,
			url: request.url,
			headers: Object.fromEntries(request.headers.entries()),
		}
	);
}

export function removeTrailingSlashes(string: string): string {
	return string.replace(/\/+$/, '');
}

// Lambda will throw an InvalidQueryStringException if the
// query string contains certain special characters or un-encoded values:
// - ?colon:name=foo
// - ?шеллы
export function encodeSearchParams(searchParams: URLSearchParams): string {
	const encodedSearchParams = [...searchParams.entries()]
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join('&');

	return encodedSearchParams ? `?${encodedSearchParams}` : '';
}

export function htmlResponse(title: string, init?: ResponseInit): Response {
	const vars = { title };
	const headers = new Headers(init?.headers);
	headers.set('Content-Type', 'text/html');

	const response = new Response(render(page, vars).toString(), {
		...init,
		headers,
	});

	return response;
}
