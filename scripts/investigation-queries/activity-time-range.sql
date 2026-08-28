-- Parameter ?1: inclusive UTC ISO-8601 start time, bound as TEXT.
-- Parameter ?2: exclusive UTC ISO-8601 end time, bound as TEXT.
-- Returns at most 100 stored activity records in the requested time range.
WITH activity AS (
	SELECT
		'fingerprint_observation' AS activity_type,
		discord_user_id,
		browser_fingerprint_hash,
		ip_hash,
		ip_prefix_hash,
		country,
		asn,
		captured_at AS activity_at
	FROM fingerprint_observations
	UNION ALL
	SELECT
		'successful_oauth' AS activity_type,
		discord_user_id,
		NULL AS browser_fingerprint_hash,
		NULL AS ip_hash,
		NULL AS ip_prefix_hash,
		NULL AS country,
		NULL AS asn,
		last_successful_oauth_at AS activity_at
	FROM auth_activity
)
SELECT
	activity_type,
	discord_user_id,
	browser_fingerprint_hash,
	ip_hash,
	ip_prefix_hash,
	country,
	asn,
	activity_at
FROM activity
WHERE activity_at >= ?1
	AND activity_at < ?2
ORDER BY activity_at DESC, discord_user_id ASC
LIMIT 100;
