const RETENTION_DAYS = 90;
const CLEANUP_BATCH_SIZE = 100;
const CLEANUP_MAX_ROUNDS = 5;
const CLEANUP_CAP_REACHED_SIGNAL = 'Retention cleanup reached its configured batch cap.';

const DELETE_EXPIRED_OBSERVATIONS = `
	DELETE FROM fingerprint_observations
	WHERE id IN (
		SELECT id
		FROM fingerprint_observations
		WHERE captured_at < ?
		ORDER BY captured_at ASC, id ASC
		LIMIT ?
	)
`;

const DELETE_EXPIRED_OAUTH_ACTIVITY = `
	DELETE FROM auth_activity
	WHERE discord_user_id IN (
		SELECT discord_user_id
		FROM auth_activity
		WHERE last_successful_oauth_at < ?
		ORDER BY last_successful_oauth_at ASC, discord_user_id ASC
		LIMIT ?
	)
`;

function retentionCutoff(scheduledTime: number): string {
	const cutoff = new Date(scheduledTime);
	cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
	return cutoff.toISOString();
}

export async function removeExpiredActivity(db: D1Database, scheduledTime: number): Promise<void> {
	const cutoff = retentionCutoff(scheduledTime);

	for (let round = 0; round < CLEANUP_MAX_ROUNDS; round += 1) {
		const [observationResult, oauthActivityResult] = await db.batch([
			db.prepare(DELETE_EXPIRED_OBSERVATIONS).bind(cutoff, CLEANUP_BATCH_SIZE),
			db.prepare(DELETE_EXPIRED_OAUTH_ACTIVITY).bind(cutoff, CLEANUP_BATCH_SIZE),
		]);

		if (
			observationResult.meta.changes < CLEANUP_BATCH_SIZE &&
			oauthActivityResult.meta.changes < CLEANUP_BATCH_SIZE
		) {
			return;
		}
	}

	console.error(CLEANUP_CAP_REACHED_SIGNAL);
}
