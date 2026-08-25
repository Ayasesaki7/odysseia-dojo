/// <reference types="@cloudflare/workers-types" />

interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	SESSION_SECRET: string;
}
