-- Parameter ?1: the verified Discord user ID, bound as TEXT.
-- Delete both V1 business tables in one transaction. Query find-user.sql again
-- after execution to confirm that no activity records remain.
BEGIN;
DELETE FROM fingerprint_observations
WHERE discord_user_id = ?1;
DELETE FROM auth_activity
WHERE discord_user_id = ?1;
COMMIT;
