import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

import { readCookie, secureCookie } from './cookies';
import { SESSION_COOKIE_NAME } from './session-contract.js';

export { SESSION_COOKIE_NAME } from './session-contract.js';

export const SESSION_DURATION_SECONDS = 8 * 24 * 60 * 60;

export interface SessionClaims extends JWTPayload {
	discordUserId: string;
	discordUsername: string;
	sessionNonce: string;
	guildVerifiedAt: number;
}

const encoder = new TextEncoder();

function sessionKey(secret: string): Uint8Array {
	const key = encoder.encode(secret);
	if (key.byteLength < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.');
	return key;
}

function isSessionClaims(payload: JWTPayload): payload is SessionClaims {
	return (
		typeof payload.discordUserId === 'string' &&
		payload.discordUserId.length > 0 &&
		typeof payload.discordUsername === 'string' &&
		payload.discordUsername.length > 0 &&
		typeof payload.sessionNonce === 'string' &&
		payload.sessionNonce.length >= 16 &&
		typeof payload.guildVerifiedAt === 'number' &&
		Number.isFinite(payload.guildVerifiedAt)
	);
}

function randomSessionNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export async function issueSession(
	identity: Pick<SessionClaims, 'discordUserId' | 'discordUsername'>,
	secret: string
): Promise<string> {
	const issuedAt = Math.floor(Date.now() / 1_000);
	return new SignJWT({
		discordUserId: identity.discordUserId,
		discordUsername: identity.discordUsername,
		sessionNonce: randomSessionNonce(),
		guildVerifiedAt: issuedAt,
	})
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setIssuedAt(issuedAt)
		.setExpirationTime(issuedAt + SESSION_DURATION_SECONDS)
		.sign(sessionKey(secret));
}

export function sessionCookie(token: string): string {
	return secureCookie(SESSION_COOKIE_NAME, token, SESSION_DURATION_SECONDS);
}

export function clearSessionCookie(): string {
	return secureCookie(SESSION_COOKIE_NAME, '', 0);
}

export async function verifySession(request: Request, secret: string): Promise<SessionClaims> {
	const token = readCookie(request, SESSION_COOKIE_NAME);
	if (!token) throw new Error('Session cookie is missing.');

	const { payload } = await jwtVerify(token, sessionKey(secret), {
		algorithms: ['HS256'],
		requiredClaims: ['iat', 'exp'],
	});

	if (!isSessionClaims(payload)) throw new Error('Session payload is invalid.');
	return payload;
}
