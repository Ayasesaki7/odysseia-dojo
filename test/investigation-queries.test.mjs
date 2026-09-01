import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '..');
const queryDirectory = resolve(projectRoot, 'scripts/investigation-queries');
const migrations = await Promise.all(
	['0001_create_auth_activity.sql', '0002_create_fingerprint_observations.sql'].map((file) =>
		readFile(resolve(projectRoot, 'migrations', file), 'utf8')
	)
);

async function fixedQuery(file) {
	return readFile(resolve(queryDirectory, file), 'utf8');
}

function createActivityDatabase() {
	const db = new DatabaseSync(':memory:');
	db.exec(migrations.join('\n'));

	const insertObservation = db.prepare(
		`INSERT INTO fingerprint_observations (
			id, discord_user_id, session_id_hash, browser_fingerprint_hash,
			ip_hash, ip_prefix_hash, captured_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)`
	);
	insertObservation.run(
		'observation-alpha-first',
		'fixture-alpha',
		'fixture-session-alpha-first',
		'fixture-fingerprint-shared',
		'fixture-ip-shared',
		'fixture-ip-prefix-shared',
		'2026-01-01T00:00:00.000Z'
	);
	insertObservation.run(
		'observation-beta',
		'fixture-beta',
		'fixture-session-beta',
		'fixture-fingerprint-shared',
		'fixture-ip-shared',
		'fixture-ip-prefix-shared',
		'2026-01-02T00:00:00.000Z'
	);
	insertObservation.run(
		'observation-alpha-second',
		'fixture-alpha',
		'fixture-session-alpha-second',
		'fixture-fingerprint-alpha-second',
		'fixture-ip-alpha-second',
		'fixture-ip-prefix-alpha-second',
		'2026-01-03T00:00:00.000Z'
	);

	const insertAuthActivity = db.prepare(
		'INSERT INTO auth_activity (discord_user_id, discord_username_snapshot, last_successful_oauth_at) VALUES (?, ?, ?)'
	);
	insertAuthActivity.run('fixture-alpha', 'fixture-alpha-name', '2026-01-01T12:00:00.000Z');
	insertAuthActivity.run('fixture-beta', 'fixture-beta-name', '2026-01-02T12:00:00.000Z');

	return db;
}

function renderRawTemplate(template, parameters) {
	return template.replace(/\?(\d+)/gu, (_match, index) => {
		const value = parameters[Number(index) - 1];
		if (typeof value === 'number') return String(value);
		return `'${value.replaceAll("'", "''")}'`;
	});
}

test('fixed investigation queries use stored hashes and bounded activity results', async (t) => {
	const db = createActivityDatabase();
	t.after(() => db.close());

	const [sameFingerprint, sameIp, sameIpPrefix, multipleFingerprints, findUser, activityTimeRange] = await Promise.all([
		fixedQuery('same-fingerprint.sql'),
		fixedQuery('same-ip.sql'),
		fixedQuery('same-ip-prefix.sql'),
		fixedQuery('multiple-fingerprints.sql'),
		fixedQuery('find-user.sql'),
		fixedQuery('activity-time-range.sql'),
	]);

	assert.deepEqual(
		db
			.prepare(sameFingerprint)
			.all('fixture-fingerprint-shared')
			.map((row) => row.discord_user_id),
		['fixture-beta', 'fixture-alpha']
	);
	assert.deepEqual(
		db
			.prepare(sameIp)
			.all('fixture-ip-shared')
			.map((row) => row.discord_user_id),
		['fixture-beta', 'fixture-alpha']
	);
	assert.deepEqual(
		db
			.prepare(sameIpPrefix)
			.all('fixture-ip-prefix-shared')
			.map((row) => row.discord_user_id),
		['fixture-beta', 'fixture-alpha']
	);
	assert.deepEqual(
		db
			.prepare(multipleFingerprints)
			.all('fixture-alpha')
			.map((row) => row.browser_fingerprint_hash),
		['fixture-fingerprint-alpha-second', 'fixture-fingerprint-shared']
	);

	const userHistory = db.prepare(findUser).all('fixture-alpha');
	assert.equal(userHistory.length, 3);
	assert.deepEqual(Object.keys(userHistory[0]).sort(), [
		'activity_at',
		'activity_type',
		'asn',
		'browser_fingerprint_hash',
		'country',
		'discord_user_id',
		'ip_hash',
		'ip_prefix_hash',
	]);
	assert.equal(Object.hasOwn(userHistory[0], 'session_id_hash'), false);
	assert.equal(Object.hasOwn(userHistory[0], 'discord_username_snapshot'), false);

	const timeRange = db
		.prepare(activityTimeRange)
		.all('2026-01-02T00:00:00.000Z', '2026-01-03T00:00:00.000Z');
	assert.deepEqual(
		timeRange.map((row) => [row.activity_type, row.discord_user_id]),
		[
			['successful_oauth', 'fixture-beta'],
			['fingerprint_observation', 'fixture-beta'],
		]
	);
});

test('fixed deletion templates avoid explicit transaction control and remove only the requested or oldest V1 activity', async (t) => {
	const userDeletionDb = createActivityDatabase();
	const oldestDeletionDb = createActivityDatabase();
	t.after(() => {
		userDeletionDb.close();
		oldestDeletionDb.close();
	});

	const [deleteUserActivity, deleteOldestActivity] = await Promise.all([
		fixedQuery('delete-user-activity.sql'),
		fixedQuery('delete-oldest-activity.sql'),
	]);
	for (const [file, template] of [
		['delete-user-activity.sql', deleteUserActivity],
		['delete-oldest-activity.sql', deleteOldestActivity],
	]) {
		assert.doesNotMatch(
			template,
			/^\s*(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/imu,
			`${file} must remain compatible with the Wrangler remote file-execution path`
		);
	}

	userDeletionDb.exec(renderRawTemplate(deleteUserActivity, ['fixture-alpha']));
	assert.deepEqual(
		userDeletionDb
			.prepare('SELECT DISTINCT discord_user_id FROM fingerprint_observations ORDER BY discord_user_id')
			.all()
			.map((row) => ({ ...row })),
		[{ discord_user_id: 'fixture-beta' }]
	);
	assert.deepEqual(
		userDeletionDb
			.prepare('SELECT discord_user_id FROM auth_activity ORDER BY discord_user_id')
			.all()
			.map((row) => ({ ...row })),
		[{ discord_user_id: 'fixture-beta' }]
	);

	oldestDeletionDb.exec(renderRawTemplate(deleteOldestActivity, [1]));
	assert.deepEqual(
		oldestDeletionDb
			.prepare('SELECT id FROM fingerprint_observations ORDER BY captured_at')
			.all()
			.map((row) => ({ ...row })),
		[{ id: 'observation-beta' }, { id: 'observation-alpha-second' }]
	);
	assert.deepEqual(
		oldestDeletionDb
			.prepare('SELECT discord_user_id FROM auth_activity ORDER BY last_successful_oauth_at')
			.all()
			.map((row) => ({ ...row })),
		[{ discord_user_id: 'fixture-beta' }]
	);
});
