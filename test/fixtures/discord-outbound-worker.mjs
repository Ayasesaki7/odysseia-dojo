export default {
	async fetch() {
		const response = await fetch('https://discord.com/api/v10/users/@me', {
			headers: { Authorization: 'Bearer test-only-token' },
		});

		return new Response(JSON.stringify({ status: response.status, body: await response.text() }), {
			headers: { 'content-type': 'application/json' },
		});
	},
};
