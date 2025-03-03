import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				main: './dist/index.js',
				wrangler: {
					configPath: './wrangler.jsonc',
					environment: 'testing',
				},
				miniflare: {
					kvNamespaces: ['HOSTS'],
				},
			},
		},
	},
});
