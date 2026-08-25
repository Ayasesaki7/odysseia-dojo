import { SignJWT } from 'jose';

import { SESSION_COOKIE_NAME } from '../../src/lib/session-contract.js';

export const TEST_SESSION_SECRET = 'test-session-secret-that-is-longer-than-thirty-two-bytes';

const encoder = new TextEncoder();

export async function signedSessionCookie(claimOverrides = {}) {
	const now = Math.floor(Date.now() / 1_000);
	const token = await new SignJWT({
		discordUserId: '123456789012345678',
		discordUsername: 'fixture-member',
		sessionNonce: 'test-session-nonce-1234567890',
		guildVerifiedAt: now,
		...claimOverrides,
	})
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setIssuedAt(now)
		.setExpirationTime(now + 60 * 60)
		.sign(encoder.encode(TEST_SESSION_SECRET));

	return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}
