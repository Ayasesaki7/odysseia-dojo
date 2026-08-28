-- Parameter ?1: a stored ip_hash from find-user.sql, never a plaintext IP address.
-- Returns at most 100 Discord IDs associated with that stored HMAC.
SELECT
	discord_user_id,
	ip_hash,
	COUNT(*) AS observation_count,
	MIN(captured_at) AS first_captured_at,
	MAX(captured_at) AS last_captured_at
FROM fingerprint_observations
WHERE ip_hash = ?1
GROUP BY discord_user_id, ip_hash
ORDER BY last_captured_at DESC, discord_user_id ASC
LIMIT 100;
