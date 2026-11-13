// Isolated PostgreSQL (WASM); no production credentials or network database.
// npm install --prefix tmp/ninja-v2-validation --no-save --package-lock=false @electric-sql/pglite
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.nodal_identities(id uuid primary key);
`);
// Read the actual dependency DDL. Never invent substitute authorization columns.
const migration = (file) => readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8");
const initial = migration("20260811000000_initial_identity_and_accounts.sql");
await db.exec(initial.match(/create type public\.nodal_access_state[^;]+;/)[0]);
for (const [file, table] of [
  ["20260811000000_initial_identity_and_accounts.sql", "nodal_users"],
  ["20260828000000_ninja_user_pairing.sql", "ninja_connectors"],
  ["20260930190000_identity_signal_controls.sql", "ninja_connector_destinations"],
  ["20260907010000_ninja_trade_telemetry.sql", "ninja_trade_telemetry_events"],
  ["20260930190000_identity_signal_controls.sql", "ninja_account_ownership"],
  ["20260907030000_ninja_technical_operation_probe.sql", "ninja_operation_probe_sessions"],
]) {
  const ddl = migration(file).match(new RegExp("create table public\\." + table + "\\s*\\([\\s\\S]*?\\n\\);"));
  assert.ok(ddl, "Real table definition required: " + table);
  await db.exec(ddl[0]);
}
await db.exec(readFileSync(new URL("../supabase/migrations/20261007000000_ninja_event_receipts.sql", import.meta.url), "utf8"));
await db.exec("alter table ninja_connectors add column identity_id uuid");
await db.exec(migration("20261113233000_shared_broker_receipt_recovery.sql"));
const owner = "00000000-0000-0000-0000-000000000001";
const physical = "00000000-0000-0000-0000-000000000002";
const destination = "00000000-0000-0000-0000-000000000003";
const token = "00000000-0000-0000-0000-000000000004";
await db.query("insert into auth.users values ($1)", [owner]);
await db.query("insert into nodal_users(id,email,access_state,authorized_at) values ($1,'fixture@example.invalid','active',now())", [owner]);
for (const id of [physical, destination]) await db.query("insert into ninja_connectors(id,owner_user_id,connector_version,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at) values ($1::uuid,$2,'test',($1::uuid)::text,now()+interval '1 hour',($1::uuid)::text,now()+interval '1 day')", [id, owner]);
await db.query("insert into ninja_connector_destinations(physical_connector_id,destination_connector_id,destination_owner_user_id,route_kind,linked_by) values ($1,$2,$3,'personal',$3)", [physical, destination, owner]);
const event = (id, dest = destination) => ({ payload: { eventId: id, kind: "balance", occurredAt: "2026-10-07T10:00:00Z", connectionName: "connection", accountName: "account", cashValue: 123.125 }, sha256: "a".repeat(64), destinationConnectorId: dest, excluded: null });
const receive = async (events) => (await db.query("select * from receive_ninja_telemetry_v2($1,$2)", [physical, JSON.stringify(events)])).rows;
const jobs = async () => (await db.query("select * from ninja_telemetry_rebuild_jobs")).rows;
try {
  assert.equal((await receive([event("one")]))[0].status, "persisted");
  assert.equal((await receive([event("one")]))[0].reason, "duplicate");
  assert.equal(Number((await jobs())[0].revision), 1);
  assert.equal((await receive([{ ...event("one"), sha256: "b".repeat(64) }]))[0].status, "conflict");
  assert.equal((await receive([event("pending", null)]))[0].status, "pending");
  assert.equal((await receive([event("pending")]))[0].status, "persisted");
  assert.equal((await receive([{ ...event("sim", null), excluded: "simulator" }]))[0].status, "excluded");
  const claimed = (await db.query("select * from claim_ninja_rebuild_job($1,$2)", [physical, token])).rows;
  assert.equal(claimed.length, 1);
  assert.equal((await db.query("select * from claim_ninja_rebuild_job($1,$2)", [physical, owner])).rows.length, 0);
  await receive([event("new-during-lease")]);
  await db.query("select finish_ninja_rebuild_job($1,$2,$3,true)", [destination, token, claimed[0].revision]);
  assert.ok(Number((await jobs())[0].revision) > Number((await jobs())[0].completed_revision));
  await db.query("update nodal_users set access_state='revoked',revoked_at=now() where id=$1", [owner]);
  await assert.rejects(receive([event("revoked")]));
  assert.equal((await db.query("select * from claim_ninja_rebuild_job($1,$2)", [physical, token])).rows.length, 0);
  await db.query("update nodal_users set access_state='active',revoked_at=null where id=$1", [owner]);
  // An unauthorized destination stays durable without blocking a valid sibling.
  const mixed = await receive([event("valid-sibling"), event("invalid-dest", physical)]);
  assert.equal(mixed[0].status, "persisted");
  assert.equal(mixed[1].status, "pending");
  assert.equal(mixed[1].reason, "destination_not_authorized");
  assert.equal((await db.query("select * from ninja_event_receipts where event_id='valid-sibling'")).rows.length, 1);
  // A recognized broker can go to its same owner's personal connector without
  // creating a general destination for every prop account in that installation.
  await db.query("insert into ninja_account_ownership(physical_connector_id,connection_name,account_name,account_type,destination_connector_id,owner_user_id,claimed_by) values($1,'connection','shared-broker','broker',$1,$2,$2)",[physical,owner]);
  assert.equal((await receive([{...event("shared-broker",physical),payload:{...event("shared-broker").payload,accountName:"shared-broker"}}]))[0].status,"persisted");
  assert.equal((await receive([event("not-a-broker",physical)]))[0].status,"pending");
  const retry = await receive([event("valid-sibling")]);
  assert.equal(retry[0].reason,"duplicate");
  assert.equal((await db.query("select count(*) count from ninja_trade_telemetry_events where event_id='valid-sibling'")).rows[0].count,1);
  // A persisted event cannot later be moved to a different destination by retry.
  assert.equal((await receive([event("one", physical)]))[0].status, "persisted");
  assert.equal((await db.query("select destination_connector_id from ninja_event_receipts where event_id='one'")).rows[0].destination_connector_id, destination);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from ninja_event_receipts"));
  await assert.rejects(receive([event("forbidden")]));
  await db.exec("reset role");
  await db.exec("update ninja_telemetry_rebuild_jobs set next_attempt_at=now()-interval '1 minute'");
  const retriedJob = (await db.query("select * from claim_ninja_rebuild_job($1,$2)", [physical, token])).rows[0];
  await db.query("select finish_ninja_rebuild_job($1,$2,$3,false)", [retriedJob.connector_id, token, retriedJob.revision]);
  assert.equal((await jobs()).find(j=>j.connector_id===retriedJob.connector_id).last_error, "processing_unavailable");
  assert.ok(Number((await jobs())[0].revision) > Number((await jobs())[0].completed_revision));
  // A late arrival during a page lease must not be skipped by its cursor.
  await db.exec("update ninja_telemetry_rebuild_jobs set completed_revision=revision,lease_token=null,lease_until=null");
  await receive([event("replay-old")]);
  const pageJob=(await db.query("select * from claim_ninja_rebuild_job($1,$2)",[physical,token])).rows[0];
  assert.ok(pageJob.replay_since);
  await receive([{...event("replay-arrived-during-lease"),payload:{...event("replay-arrived-during-lease").payload,occurredAt:"2026-10-07T09:00:00Z"}}]);
  await db.query("select finish_ninja_rebuild_job_page($1,$2,$3,true,'2026-10-07T10:01:00Z')",[destination,token,pageJob.revision]);
  const replay=(await jobs()).find(j=>j.connector_id===destination);
  assert.equal(new Date(replay.replay_since).toISOString(),"2026-10-07T09:00:00.000Z");
  assert.ok(Number(replay.revision)>Number(replay.completed_revision));
  console.log("PASS: recognized shared broker, valid/invalid mixed batch, receipt idempotency, pending retry, exclusion, leases, replay cursor with concurrent late arrival, authenticated isolation.");
} finally { await db.close(); }
