-- Parameter ?1: the verified Discord user ID, bound as TEXT.
-- Returns no rows unless this user has more than one stored browser fingerprint HMAC.
WITH user_observations AS (
	SELECT browser_fingerprint_hash, captured_at
	FROM fingerprint_observations
	WHERE discord_user_id = ?1
		AND browser_fingerprint_hash IS NOT NULL
)
SELECT
	browser_fingerprint_hash,
	COUNT(*) AS observation_count,
	MIN(captured_at) AS first_captured_at,
	MAX(captured_at) AS last_captured_at
FROM user_observations
GROUP BY browser_fingerprint_hash
HAVING (SELECT COUNT(DISTINCT browser_fingerprint_hash) FROM user_observations) > 1
ORDER BY last_captured_at DESC, browser_fingerprint_hash ASC
LIMIT 100;
