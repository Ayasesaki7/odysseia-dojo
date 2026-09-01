-- Parameter ?1: the verified Discord user ID, bound as TEXT.
-- When run as the complete remote Wrangler file, D1 imports both fixed DELETE
-- statements atomically. Query find-user.sql again after execution to confirm
-- that no activity records remain. Do not add explicit transaction-control
-- statements.
DELETE FROM fingerprint_observations
WHERE discord_user_id = ?1;
DELETE FROM auth_activity
WHERE discord_user_id = ?1;
