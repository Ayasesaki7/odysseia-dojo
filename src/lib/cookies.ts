export function readCookie(request: Request, name: string): string | undefined {
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

export function secureCookie(name: string, value: string, maxAge: number): string {
	return [
		`${name}=${encodeURIComponent(value)}`,
		'HttpOnly',
		'Secure',
		'SameSite=Lax',
		'Path=/',
		`Max-Age=${maxAge}`,
	].join('; ');
}
