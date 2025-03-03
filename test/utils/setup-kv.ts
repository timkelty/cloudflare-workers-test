import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import HOSTS from '../fixtures/kv/HOSTS';

beforeAll(async () => {
	for (const [key, value] of Object.entries(HOSTS)) {
		await env.HOSTS.put(key, JSON.stringify(value));
	}
});
