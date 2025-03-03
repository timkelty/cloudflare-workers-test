declare interface KeyValueData {
	environmentId: string;
	signingKey: string;
	hostname: string;
	originHostname: string;
}

declare interface Env extends GeneratedEnv {
	HOSTS: KVNamespace;
	CF_VERSION_METADATA: WorkerVersionMetadata;

	// Worker secret
	CF_PURGE_API_TOKEN: string;
}

declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}

declare module '*.html' {
	const value: string;
	export default value;
}
