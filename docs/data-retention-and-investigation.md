# V1 data retention and investigation runbook

This runbook is for the Cloudflare account administrator only. It operates the
two V1 business tables, `fingerprint_observations` and `auth_activity`; it does
not create a website administration page, an investigator command, a Bot
integration, an audit table, or an arbitrary-SQL network interface.

## Daily retention cleanup

[`wrangler.jsonc`](../wrangler.jsonc) configures the deployed Worker to run at
`0 0 * * *` (00:00 UTC) every day. Its `scheduled()` entrypoint removes, in a
bounded batch of 100 rows per table, records strictly older than 90 days using
the scheduled event time:

- `fingerprint_observations.captured_at` is the observation retention clock.
- `auth_activity.last_successful_oauth_at` is the OAuth-activity retention
  clock.

The strict boundary means a row exactly 90 days old is retained until a later
run. A later scheduled run processes the next bounded batch, so use the
Dashboard's Cron Events and D1 capacity views to confirm the job continues to
run. Do not add request-path cleanup, browser behavior, or a manual public
trigger.

## Fixed query catalog

Only use the checked-in SQL below. They return stored Discord IDs, HMAC values,
timestamps, and other minimized fields as needed for an investigation; none
accepts or reconstructs a plaintext IP address. They cap returned rows at 100.

| Need | Fixed SQL |
| --- | --- |
| Find a verified user's stored activity in both V1 tables | [`find-user.sql`](../scripts/investigation-queries/find-user.sql) |
| Check Discord IDs associated with one stored browser fingerprint HMAC | [`same-fingerprint.sql`](../scripts/investigation-queries/same-fingerprint.sql) |
| Check Discord IDs associated with one stored IP HMAC | [`same-ip.sql`](../scripts/investigation-queries/same-ip.sql) |
| Check Discord IDs associated with one stored IP-prefix HMAC | [`same-ip-prefix.sql`](../scripts/investigation-queries/same-ip-prefix.sql) |
| Check whether one verified user has multiple stored browser fingerprint HMACs | [`multiple-fingerprints.sql`](../scripts/investigation-queries/multiple-fingerprints.sql) |
| Review stored activity in a UTC time range | [`activity-time-range.sql`](../scripts/investigation-queries/activity-time-range.sql) |

The `?1` and `?2` markers are ordered D1 parameters. Keep a checked-in query
unchanged and bind values when the approved D1 client offers parameter binding.
`wrangler d1 execute --file` sends raw SQL and has no bind-value flag. When
using the Dashboard D1 Console or Wrangler raw-file path, make a temporary,
local rendered copy of the selected template and replace **only** its documented
parameter markers. Do not add predicates, table names, joins, or statements.
Never commit, upload, or retain that rendered copy.

Before rendering a raw-file copy, validate the input for its documented slot:

| Parameter | Allowed value |
| --- | --- |
| Discord user ID | The exact verified Discord Snowflake, copied and bound as a quoted string; do not convert it to a number. |
| Browser/IP/IP-prefix HMAC | An existing lowercase 64-character hexadecimal value returned by `find-user.sql`; never supply a plaintext IP address. |
| Start/end time | Canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` text; the start is inclusive and the end is exclusive. |
| Oldest-data batch size | An integer from 1 through 100. |

For a remote execution, use only the configured database name and a temporary
file, for example:

```sh
npx wrangler d1 execute <configured-d1-database-name> --remote --file <temporary-fixed-query.sql>
```

Do not paste Cookies, OAuth access tokens, Secrets, plaintext IP addresses, or
full query results into a shell command, terminal capture, issue, chat, or
service log. Do not save result output. A minimal operational note may record
only the action, time, and success or failure without an ID, HMAC, or result
contents.

## Verified-account request and early deletion

1. Require the requester to make the request from the Discord account in
   question and complete a one-time confirmation through the community's normal
   private support channel. A claimed display name, screenshot, or copied ID
   alone is not proof of account control.
2. After confirmation, copy that account's Discord User ID and handle it as a
   string. Use the fixed `find-user.sql` template first; it reads both V1 tables
   and may supply stored HMACs for the correlation templates.
3. If the requester asks for early deletion, run only
   [`delete-user-activity.sql`](../scripts/investigation-queries/delete-user-activity.sql)
   with that same verified string ID. It deletes associated rows from both V1
   business tables in one transaction. Do not delete or create future-version
   audit tables.
4. Run the fixed `find-user.sql` template again to verify that it returns no
   activity for the verified ID. Do not record the result contents outside the
   D1 session.

Do not use D1 Time Travel for day-to-day investigation, to extend retention, or
to reverse an early-deletion request. It is only for disaster recovery.

## Recovery and capacity limits

Active business records have a maximum 90-day retention period. A D1 disaster
recovery copy can remain for at most an additional 7 days, so the maximum
single-period disclosure is 97 days. Early deletion does not erase an existing
recovery copy immediately, and that copy must not be restored to evade the
request.

Monitor D1 capacity before the Free limit is reached. If capacity approaches a
limit, first investigate unusual traffic, avoid broad or repeated query runs,
and check the daily cleanup's Cron Events. If capacity still requires action,
use the bounded fixed
[`delete-oldest-activity.sql`](../scripts/investigation-queries/delete-oldest-activity.sql)
template to remove the oldest records from both V1 tables, repeating only as
needed. Do not wait for writes to fail and do not substitute a paid-plan upgrade
for cleanup.
