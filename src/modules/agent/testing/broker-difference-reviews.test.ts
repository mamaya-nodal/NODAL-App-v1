import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { repairFixture, fixtureIds as i } from "./repair-fixture";
let db: PGlite;
const connector = "88888888-8888-4888-8888-888888888888";
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  db = await repairFixture();
  await db.exec("alter table ninja_operation_probe_sessions add column if not exists result_verified boolean not null default false, add column if not exists result_conflict boolean not null default false");
  await db.exec(readFileSync("supabase/migrations/20261114130000_independent_broker_balance_reviews.sql", "utf8"));
  const original = (await db.query<{ definition: string }>("select pg_get_functiondef('reconcile_nodal_preoperation_broker_transfer(uuid,uuid,uuid,date,text,bigint,text)'::regprocedure) definition")).rows[0].definition;
  // Production contains accumulated editor indentation. Formatting must not
  // invalidate or partially apply a guarded function update.
  await db.exec(original.split("\n").map((line, index) => " ".repeat(index * 2) + line.trimStart()).join("\n"));
  await db.exec(readFileSync("supabase/migrations/20261114131000_confirm_independent_broker_reviews.sql", "utf8"));
}, 120000);
afterAll(async () => { if (db) await db.close(); vi.useRealTimers(); });
beforeEach(async () => {
  await db.exec(`begin; insert into ninja_connectors(id,owner_user_id,connector_version,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at)
    values('${connector}','${i.owner}','0.18','test-access',now()+interval '1 day','test-refresh',now()+interval '1 day');`);
});
afterEach(async () => { await db.exec("rollback"); });
const observe = async (id: string, actual: number, expected: number, at = "2026-11-13T19:51:04Z", baseline = "2026-11-11T19:00:00Z") =>
  (await db.query<{ created: boolean }>("select record_ninja_broker_balance_difference($1,$2,'2234971','Live',$3,$4,$5,$6) created", [connector, `ninja-preoperation:${id}`, actual, expected, at, baseline])).rows[0].created;
const events = async () => (await db.query<{ balance_cents: number; source_accounts: { expectedBalanceInCents: number }[] }>("select balance_cents,source_accounts from ninja_broker_balance_events order by observed_at")).rows;
async function inventory(id: string, at: string, cash: number, pnl: number) {
  if (id === "before") await inventory("baseline-heartbeat", new Date(Date.parse(at) - 15000).toISOString(), cash, pnl);
  await db.query("insert into ninja_inventory_snapshots(event_id,connector_id,observed_at,account_count,accounts) values($1,$2,$3,1,$4)",
    [id, connector, at, [{ accountName: "2234971", connectionName: "Live", connectionStatus: "Connected", cashValue: cash / 100, netLiquidation: cash / 100, realizedProfitLoss: pnl / 100, unrealizedProfitLoss: 0 }]]);
}
const inventoryReview = async (id: string, at: string, cash: number, pnl: number) =>
  (await db.query<{ created: boolean }>("select observe_ninja_broker_inventory_difference($1,$2,'2234971','Live',$3,$4,$5) created", [connector, id, cash, pnl, at])).rows[0].created;

it("records the new 8551 difference despite the unrelated October pending, preserving both", async () => {
  expect(await observe("old", 805858, 911006, "2026-10-30T15:18:02Z", "2026-10-30T12:00:00Z")).toBe(true);
  expect(await observe("new", 993008, 137908)).toBe(true);
  expect((await events()).map((row) => Number(row.balance_cents) - row.source_accounts[0].expectedBalanceInCents)).toEqual([-105148, 855100]);
  expect(await observe("new", 993008, 137908)).toBe(false);
});

it("does not repeat a cash difference on the next heartbeat, but retains a second new movement", async () => {
  expect(await observe("a", 120000, 100000)).toBe(true);
  expect(await observe("b", 120000, 100000, "2026-11-13T19:52:00Z")).toBe(false);
  expect(await observe("c", 125000, 100000, "2026-11-13T19:53:00Z")).toBe(true);
  expect((await events())[1].source_accounts[0].expectedBalanceInCents).toBe(120000);
});

it("carries a pending difference through a proven trade without presenting its loss as a withdrawal", async () => {
  await observe("a", 120000, 100000, "2026-11-13T19:00:00Z");
  const event = (await db.query<{ id: number }>("insert into ninja_trade_telemetry_events(connector_id,event_id,event_type,occurred_at,connection_name,account_name,payload) values($1,'execution','execution','2026-11-13T19:01:00Z','Live','2234971','{}') returning id", [connector])).rows[0].id;
  await db.query("insert into ninja_operation_probe_sessions(connector_id,connection_name,account_name,opening_event_id,opened_at,last_event_at,settled_at,status,opening_balance,closing_balance,result,result_verified) values($1,'Live','2234971',$2,'2026-11-13T19:01:00Z','2026-11-13T19:05:00Z','2026-11-13T19:05:00Z','closed',1200,1100,-100,true)", [connector, event]);
  expect(await observe("after-trade", 110000, 100000)).toBe(false);
  expect(await observe("additional-cash", 115000, 100000)).toBe(true);
  expect((await events())[1].source_accounts[0].expectedBalanceInCents).toBe(110000);
});

it("creates an inventory pending before any new trade and deduplicates its repeated readings", async () => {
  await inventory("before", "2026-11-13T19:00:00Z", 137908, 0);
  await inventory("after", "2026-11-13T19:07:00Z", 993008, 0);
  expect(await inventoryReview("after", "2026-11-13T19:07:00Z", 993008, 0)).toBe(false);
  await inventory("stable", "2026-11-13T19:07:15Z", 993008, 0);
  expect(await inventoryReview("stable", "2026-11-13T19:07:15Z", 993008, 0)).toBe(true);
  await inventory("heartbeat", "2026-11-13T19:08:00Z", 993008, 0);
  expect(await inventoryReview("heartbeat", "2026-11-13T19:08:00Z", 993008, 0)).toBe(false);
  expect(await events()).toHaveLength(1);
});

it("subtracts realized PnL instead of calling an ordinary trade a transfer", async () => {
  await inventory("before", "2026-11-13T19:00:00Z", 100000, 0);
  await inventory("after", "2026-11-13T19:07:00Z", 90000, -10000);
  await inventory("stable", "2026-11-13T19:07:15Z", 90000, -10000);
  expect(await inventoryReview("stable", "2026-11-13T19:07:15Z", 90000, -10000)).toBe(false);
  expect(await events()).toHaveLength(0);
});

it("isolates a cash increase credited during a losing trade from the realized loss", async () => {
  await inventory("before", "2026-11-13T19:00:00Z", 100000, 0);
  await inventory("after", "2026-11-13T19:07:00Z", 110000, -10000);
  await inventory("stable", "2026-11-13T19:07:15Z", 110000, -10000);
  expect(await inventoryReview("stable", "2026-11-13T19:07:15Z", 110000, -10000)).toBe(true);
  expect((await events())[0].source_accounts[0].expectedBalanceInCents).toBe(90000);
});

it("does not derive cash movements from an overnight PnL reset", async () => {
  await inventory("before", "2026-11-12T19:00:00Z", 100000, 15000);
  await inventory("after", "2026-11-13T19:07:00Z", 100000, 0);
  expect(await inventoryReview("after", "2026-11-13T19:07:00Z", 100000, 0)).toBe(false);
  expect(await events()).toHaveLength(0);
});

it("does not turn separately arriving cash and PnL callbacks into a transfer", async () => {
  await inventory("before", "2026-11-13T19:00:00Z", 100000, 0);
  await inventory("cash-first", "2026-11-13T19:07:00Z", 110000, 0);
  expect(await inventoryReview("cash-first", "2026-11-13T19:07:00Z", 110000, 0)).toBe(false);
  await inventory("pnl-next", "2026-11-13T19:07:02Z", 110000, 10000);
  await inventory("stable", "2026-11-13T19:07:15Z", 110000, 10000);
  expect(await inventoryReview("stable", "2026-11-13T19:07:15Z", 110000, 10000)).toBe(false);
  expect(await events()).toHaveLength(0);
});

it("retains a neutral difference against the confirmed balance when there is no same-day inventory reference", async () => {
  await observe("october", 805858, 911006, "2026-10-30T15:18:02Z", "2026-10-30T12:00:00Z");
  await inventory("new-day", "2026-11-13T19:07:00Z", 110000, 0);
  await inventory("stable", "2026-11-13T19:07:15Z", 110000, 0);
  expect(await inventoryReview("stable", "2026-11-13T19:07:15Z", 110000, 0)).toBe(true);
  expect((await events())[1].source_accounts[0].expectedBalanceInCents).toBe(100000);
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(0);
});

it("does not grant the evidence-writing functions to anonymous or authenticated callers", async () => {
  const rows = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','record_ninja_broker_balance_difference(uuid,text,text,text,bigint,bigint,timestamptz,timestamptz)','execute') allowed");
  expect(rows.rows[0].allowed).toBe(false);
});

async function tradeWithGap(actual: number) {
  await db.exec(`select confirm_nodal_daily_control(target_period_id=>'${i.period}',target_kind=>'deposit',target_operated_on=>current_date,target_confirmation_key=>gen_random_uuid(),target_amount_cents=>100000,target_origin_destination=>'Aporte trader');
    select confirm_nodal_daily_control(target_period_id=>'${i.period}',target_kind=>'balance_update',target_operated_on=>current_date,target_confirmation_key=>gen_random_uuid(),target_balance_cents=>90000,target_company_id=>'${i.company}',target_leader_account_id=>'${i.account}',target_phase=>'Evaluacion');
    update daily_controls set source='ninjatrader',source_event_key='ninja-operation:999',received_balance_cents=${actual},sync_issue_reason=case when balance_after_cents=${actual} then null else 'Diferencia anterior' end where kind='balance_update';`);
}
const confirm = async (source: string) => db.query("select reconcile_nodal_preoperation_broker_transfer((select id from ninja_broker_balance_events where source_event_id=$1),$2,$3,current_date,'wallet_to_broker',0,null)", [`ninja-preoperation:${source}`, i.period, i.wallet]);

it("confirms the original transfer after a later trade without using today's cash as the transfer amount", async () => {
  await observe("cash", 120000, 100000);
  await tradeWithGap(110000);
  await confirm("cash");
  const controls = (await db.query<{ balance_after_cents: number; movement_cents: number; received_balance_cents: number }>("select balance_after_cents,movement_cents,received_balance_cents from daily_controls order by control_number desc limit 1")).rows[0];
  expect(Number(controls.movement_cents)).toBe(20000);
  expect(Number(controls.balance_after_cents)).toBe(110000);
  expect(Number(controls.received_balance_cents)).toBe(110000);
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(1);
  await expect(confirm("cash")).rejects.toThrow("PREOPERATION_TRANSFER_EVENT_INVALID");
});

it("confirms two pending transfers independently, retaining the remaining discrepancy after the first", async () => {
  await observe("a", 120000, 100000);
  await observe("b", 125000, 100000, "2026-11-13T19:52:00Z");
  await tradeWithGap(115000);
  await confirm("b");
  const partial = (await db.query<{ balance_after_cents: number; received_balance_cents: number }>("select balance_after_cents,received_balance_cents from daily_controls order by control_number desc limit 1")).rows[0];
  expect(Number(partial.balance_after_cents)).toBe(95000);
  expect(Number(partial.received_balance_cents)).toBe(115000);
  await confirm("a");
  expect(Number((await db.query<{ balance_after_cents: number }>("select balance_after_cents from daily_controls order by control_number desc limit 1")).rows[0].balance_after_cents)).toBe(115000);
});

it("refuses an old event that no longer fits the outstanding cash discrepancy", async () => {
  await observe("stale", 120000, 100000);
  await tradeWithGap(90000);
  await db.exec("savepoint rejected_confirmation");
  await expect(confirm("stale")).rejects.toThrow("PREOPERATION_TRANSFER_REVIEW_REQUIRED");
  await db.exec("rollback to savepoint rejected_confirmation");
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(0);
});

it("preserves today's received balance when an old reference happens to equal the accounting balance", async () => {
  await observe("partial", 110000, 90000);
  await tradeWithGap(140000);
  await confirm("partial");
  const row = (await db.query<{ balance_after_cents: number; received_balance_cents: number }>("select balance_after_cents,received_balance_cents from daily_controls order by control_number desc limit 1")).rows[0];
  expect(Number(row.balance_after_cents)).toBe(110000);
  expect(Number(row.received_balance_cents)).toBe(140000);
});
