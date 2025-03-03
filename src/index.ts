import Worker from './Worker';

// So Worker class is importable from test/utils.ts
// Not sure why this is snecessary with `find_additional_modules`?
export { Worker };

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return Worker.fetch(request, env as Env, ctx);
	},
} satisfies ExportedHandler;
