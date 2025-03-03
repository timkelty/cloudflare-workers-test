import Worker from './Worker';

// So Worker class is importable from test/utils.ts
export { Worker };

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return Worker.fetch(request, env as Env, ctx);
	},
} satisfies ExportedHandler;
