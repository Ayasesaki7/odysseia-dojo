-- Parameter ?1: an integer batch size from 1 through 100.
-- Use only after the capacity checks in docs/data-retention-and-investigation.md.
-- Deletes the oldest rows from both V1 business tables in one transaction.
BEGIN;
DELETE FROM fingerprint_observations
WHERE id IN (
	SELECT id
	FROM fingerprint_observations
	ORDER BY captured_at ASC, id ASC
	LIMIT ?1
);
DELETE FROM auth_activity
WHERE discord_user_id IN (
	SELECT discord_user_id
	FROM auth_activity
	ORDER BY last_successful_oauth_at ASC, discord_user_id ASC
	LIMIT ?1
);
COMMIT;
