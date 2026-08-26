/// <reference types="@cloudflare/workers-types" />

interface DojoEnvironment {
	ASSETS: Fetcher;
	DB: D1Database;
	SESSION_SECRET: string;
	DISCORD_CLIENT_ID: string;
	DISCORD_CLIENT_SECRET: string;
	DISCORD_REDIRECT_URI: string;
	DISCORD_GUILD_ID: string;
}

interface Env extends DojoEnvironment {}

declare namespace Cloudflare {
	interface Env extends DojoEnvironment {}
}
