// Isolated PostgreSQL (WASM); no production credentials or network database.
// npm install --prefix tmp/ninja-v2-validation --no-save --package-lock=false @electric-sql/pglite
import { PGlite } from "../tmp/ninja-v2-validation/node_modules/@electric-sql/pglite/dist/index.js";
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
]) {
  const ddl = migration(file).match(new RegExp("create table public\\." + table + "\\s*\\([\\s\\S]*?\\n\\);"));
  assert.ok(ddl, "Real table definition required: " + table);
  await db.exec(ddl[0]);
}
await db.exec(readFileSync(new URL("../supabase/migrations/20261007000000_ninja_event_receipts.sql", import.meta.url), "utf8"));
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
  // Whole transaction rolls back, including preceding valid events.
  await assert.rejects(receive([event("rollback"), event("invalid-dest", physical)]));
  assert.equal((await db.query("select * from ninja_event_receipts where event_id='rollback'")).rows.length, 0);
  // A persisted event cannot later be moved to a different destination by retry.
  assert.equal((await receive([event("one", physical)]))[0].status, "persisted");
  assert.equal((await db.query("select destination_connector_id from ninja_event_receipts where event_id='one'")).rows[0].destination_connector_id, destination);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select * from ninja_event_receipts"));
  await assert.rejects(receive([event("forbidden")]));
  await db.exec("reset role");
  await db.exec("update ninja_telemetry_rebuild_jobs set next_attempt_at=now()-interval '1 minute'");
  const retry = (await db.query("select * from claim_ninja_rebuild_job($1,$2)", [physical, token])).rows[0];
  await db.query("select finish_ninja_rebuild_job($1,$2,$3,false)", [destination, token, retry.revision]);
  assert.equal((await jobs())[0].last_error, "processing_unavailable");
  assert.ok(Number((await jobs())[0].revision) > Number((await jobs())[0].completed_revision));
  console.log("PASS: migration, receipts, idempotency, conflicts, pending retry, exclusion, rollback, leases, revisions and authenticated isolation.");
} finally { await db.close(); }
