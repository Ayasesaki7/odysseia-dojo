-- Parameter ?1: the verified Discord user ID, bound as TEXT.
-- Returns at most 100 stored activity records; it never attempts to reconstruct an IP address.
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
WHERE discord_user_id = ?1
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
WHERE discord_user_id = ?1
ORDER BY activity_at DESC
LIMIT 100;
