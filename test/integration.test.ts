import { fetchMock, SELF } from 'cloudflare:test';
import documentWithEsi from './fixtures/html/document-with-esi.html';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { interceptUrl } from './utils/utils';

beforeAll(async () => {
	// Enable outbound request mocking...
	fetchMock.activate();
	// ...and throw errors if an outbound request isn't mocked
	fetchMock.disableNetConnect();
});

// Ensure we matched every mock we defined
afterEach(() => fetchMock.assertNoPendingInterceptors());

it('Responds to unknowns host', async () => {
	const response = await SELF.fetch('https://foo.gateway.cloud');
	expect(response.status).toBe(404);
});

it('Responds to invalid signatures', async () => {
	const response = await SELF.fetch('https://site.preview.gateway.cloud/', {
		method: 'HEAD',
		headers: {
			'Cache-Purge-Tag': 'foo',
		},
	});

	expect(response.status).toBe(401);
});

it('Responds from origin', async () => {
	const url = 'https://site.preview.gateway.cloud/hello-world';
	(await interceptUrl(url)).reply(200, '👍');

	const response = await SELF.fetch(url);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe('👍');
});

it('Does not process ESI without Surrogate-Control headers', async () => {
	const url = 'https://site.preview.gateway.cloud/document-with-esi';
	(await interceptUrl(url)).reply(200, documentWithEsi);

	const response = await SELF.fetch(url);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe(documentWithEsi);
});
