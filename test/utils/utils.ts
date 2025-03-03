import { env, fetchMock, MockInterceptor } from 'cloudflare:test';

// @ts-ignore
import { Worker } from '../../dist/index';

export async function interceptUrl(url: string | URL, options: Partial<MockInterceptor.Options> = {}) {
	const { hostname, pathname, searchParams } = new URL(url);
	const { originHostname } = await Worker.getKvDataForHostname(hostname, env);

	const interceptOptions: MockInterceptor.Options = Object.assign(
		{
			path: pathname,
			query: Object.fromEntries(searchParams.entries()),
		},
		options,
	);

	return fetchMock.get(`https://${originHostname}`).intercept(interceptOptions);
}
