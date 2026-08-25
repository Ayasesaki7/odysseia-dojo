import { jwtVerify, type JWTPayload } from 'jose';

import { SESSION_COOKIE_NAME } from './session-contract.js';

export { SESSION_COOKIE_NAME } from './session-contract.js';

export interface SessionClaims extends JWTPayload {
	discordUserId: string;
	discordUsername: string;
	sessionNonce: string;
	guildVerifiedAt: number;
}

const encoder = new TextEncoder();

function readCookie(request: Request, name: string): string | undefined {
	const cookieHeader = request.headers.get('Cookie');
	if (!cookieHeader) return undefined;

	for (const item of cookieHeader.split(';')) {
		const [cookieName, ...valueParts] = item.trim().split('=');
		if (cookieName !== name || valueParts.length === 0) continue;

		try {
			return decodeURIComponent(valueParts.join('='));
		} catch {
			return undefined;
		}
	}
}

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
