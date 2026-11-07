import { afterAll, beforeAll, beforeEach, afterEach, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { repairFixture, fixtureIds as i } from "./repair-fixture";
import { ninjaBatchFixture } from "./repair-ninja-fixture";
let db: PGlite;
beforeAll(async () => { db = await repairFixture(); }, 120000);
afterAll(async () => { if (db) await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });

it("deduplicates repeated daily audit findings and denies the RPC to traders", async () => {
  const args = [i.owner,"case-key","Cuenta pendiente","Requiere revisión",{ source: "deterministic_audit" },"normal"];
  const first = (await db.query<{ id: string }>("select record_nodalito_audit_finding($1,$2,$3,$4,$5,$6) id",args)).rows[0].id;
  expect((await db.query<{ id: string }>("select record_nodalito_audit_finding($1,$2,$3,$4,$5,$6) id",args)).rows[0].id).toBe(first);
  expect((await db.query("select * from nodal_agent_cases")).rows).toHaveLength(1);
  expect((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.record_nodalito_audit_finding(uuid,text,text,text,jsonb,text)','execute') allowed")).rows[0].allowed).toBe(false);
});

async function prepare(action: string, parameters: Record<string, unknown>) {
  const { rows } = await db.query<{ id: string }>("select public.prepare_nodalito_repair($1,$2,$3) id", [i.period, action, parameters]);
  const plan = (await db.query<{ value: { status: string; failure: string | null } }>("select public.get_nodalito_repair($1) value", [rows[0].id])).rows[0].value;
  expect(plan.failure).toBeNull();
  expect(plan.status).toBe("ready");
  return rows[0].id;
}

it("retries an owned Ninja batch from the actual opening snapshot", async () => {
  const batch = await ninjaBatchFixture(db, true);
  await db.exec("set local role authenticated");
  const context = (await db.query<{ value: { connectors: { id: string }[]; operations: { id: string }[] } }>("select get_nodalito_repair_context() value")).rows[0].value;
  expect(context.connectors).toHaveLength(1);
  expect(context.operations[0].id).toBe(batch);
  expect(JSON.stringify(context)).not.toMatch(/access_token|refresh_token|test-access|test-refresh/);
  await db.exec("reset role");
  await db.query("select apply_nodalito_repair($1)", [await prepare("retry_reconciliation", { batch_id: batch })]);
  expect((await db.query<{ value: string }>("select accounting_status value from ninja_operation_batches where id=$1", [batch])).rows[0].value).toBe("committed");
  expect((await db.query<{ value: number }>("select balance_after_cents::int value from daily_controls")).rows[0].value).toBe(90000);
});

it("recovers all five explicit participants with the official per-account rounding", async () => {
  await db.exec(`insert into accounts(period_id,workspace_id,company_id,reference_number,created_by) select '${i.period}','${i.workspace}','${i.company}',n,'${i.owner}' from generate_series(2,5) n;`);
  const ids = (await db.query<{ id: string }>("select id from accounts order by reference_number")).rows.map((a) => a.id);
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  await db.query("select apply_nodalito_repair($1)", [await prepare("recover_operation", { account_ids: ids, operated_on: date, phase: "Evaluacion", balance_before_cents: 100000, balance_cents: 89997, after_control_id: "", evidence_note: "Cinco participantes confirmados en el ensayo" })]);
  expect((await db.query("select * from operation_entries where magnitude_cents=2001")).rows).toHaveLength(5);
  await db.exec(`update accounts set state='virgin' where id='${i.account}'`);
  await db.query("select apply_nodalito_repair($1)", [await prepare("account_state", { account_id: i.account })]);
  expect((await db.query<{ state: string }>("select state from accounts where id=$1",[i.account])).rows[0].state).toBe("live");
});

it("assigns an unmatched coverage to the explicitly selected account", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  await db.query("select apply_nodalito_repair($1)", [await prepare("recover_operation", { account_ids: [i.account], operated_on: date, phase: "Evaluacion", balance_before_cents: 100000, balance_cents: 90000, after_control_id: "", evidence_note: "Saldo anterior confirmado para el ensayo" })]);
  const batch = await ninjaBatchFixture(db, false, 900);
  await db.query("select apply_nodalito_repair($1)", [await prepare("coverage_members", { batch_id: batch, account_ids: [i.account], close_accounts: false })]);
  expect((await db.query<{ value: string }>("select accounting_status value from ninja_operation_batches where id=$1", [batch])).rows[0].value).toBe("committed");
  expect((await db.query("select * from daily_controls")).rows).toHaveLength(2);
  expect((await db.query<{ value: number }>("select balance_after_cents::int value from daily_controls order by control_number desc limit 1")).rows[0].value).toBe(80000);
});

it("reconciles a detected broker deposit and charges its fee exactly once", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  await db.query("select apply_nodalito_repair($1)", [await prepare("recover_operation", { account_ids: [i.account], operated_on: date, phase: "Evaluacion", balance_before_cents: 100000, balance_cents: 90000, after_control_id: "", evidence_note: "Saldo anterior confirmado para el ensayo" })]);
  await ninjaBatchFixture(db, false, 900);
  const event = (await db.query<{ id: string }>("insert into ninja_broker_balance_events(connector_id,source_event_id,observed_at,balance_cents,source_accounts) values('88888888-8888-4888-8888-888888888888','ninja-preoperation:fixture',now(),110000,'[{\"expectedBalanceInCents\":90000}]') returning id")).rows[0].id;
  const plan = await prepare("broker_transfer", { event_id: event, wallet_id: i.wallet, occurred_on: date, kind: "wallet_to_broker", fee_cents: 1500 });
  await db.query("select apply_nodalito_repair($1)", [plan]);
  await db.query("select apply_nodalito_repair($1)", [plan]);
  expect((await db.query<{ value: number }>("select calculate_nodal_wallet_balance($1)::int value", [i.wallet])).rows[0].value).toBe(78500);
  expect((await db.query<{ value: number }>("select balance_after_cents::int value from daily_controls order by control_number desc limit 1")).rows[0].value).toBe(110000);
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(1);
});

it("corrects purchase funding with real wallet and contribution calculations", async () => {
  const plan = await prepare("purchase_origin", { account_id: i.account, wallet_id: i.wallet, price_cents: 13000 });
  await db.query("select public.apply_nodalito_repair($1)", [plan]);
  expect((await db.query<{ value: number }>("select public.calculate_nodal_wallet_balance($1)::int value", [i.wallet])).rows[0].value).toBe(87000);
  await db.exec(`select set_config('request.jwt.claim.sub','${i.master}',false); select set_config('request.jwt.claims','{"aal":"aal2"}',false);`);
  const undone = (await db.query<{ value: { status: string } }>("select public.revert_nodalito_repair($1) value", [plan])).rows[0].value;
  expect(undone.status).toBe("reverted");
  await db.exec(`select set_config('request.jwt.claim.sub','${i.owner}',false)`);
  expect((await db.query<{ value: number }>("select public.calculate_nodal_wallet_balance($1)::int value", [i.wallet])).rows[0].value).toBe(100000);
});

it("recovers a missing operation and reconstructs the next result without changing its observed balance", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  const input = { account_ids: [i.account], operated_on: date, phase: "Evaluacion", balance_before_cents: 100000, balance_cents: 90000, after_control_id: "", evidence_note: "Saldos y participante confirmados por el usuario" };
  await db.query("select public.apply_nodalito_repair($1)", [await prepare("recover_operation", input)]);
  await db.query("select public.apply_nodalito_repair($1)", [await prepare("recover_operation", { ...input, balance_cents: 95000 })]);
  const controls = await db.query("select balance_before_cents::int, balance_after_cents::int, operating_result_cents::int from public.daily_controls order by control_number");
  expect(controls.rows).toEqual([
    { balance_before_cents: 100000, balance_after_cents: 95000, operating_result_cents: -5000 },
    { balance_before_cents: 95000, balance_after_cents: 90000, operating_result_cents: -5000 },
  ]);
  const control = (await db.query<{ id: string }>("select id from daily_controls where control_number=1")).rows[0].id;
  await db.query("select apply_nodalito_repair($1)", [await prepare("correct_balance", { daily_control_id: control, balance_cents: 96000, reason: "Saldo histórico confirmado por el usuario" })]);
  expect((await db.query("select balance_before_cents::int, balance_after_cents::int, operating_result_cents::int from daily_controls order by control_number")).rows).toEqual([
    { balance_before_cents: 100000, balance_after_cents: 96000, operating_result_cents: -4000 },
    { balance_before_cents: 96000, balance_after_cents: 90000, operating_result_cents: -6000 },
  ]);
});

it("refuses a simulation that would overdraw a wallet, without partial writes", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  const params = { wallet_id: i.wallet, occurred_on: date, kind: "personal_withdrawal", amount_cents: 200000, fee_cents: 0 };
  const plan = (await db.query<{ id: string }>("select public.prepare_nodalito_repair($1,'wallet_movement',$2) id", [i.period, params])).rows[0].id;
  const preview = (await db.query<{ value: { status: string } }>("select public.get_nodalito_repair($1) value", [plan])).rows[0].value;
  expect(preview.status).toBe("needs_review");
  expect((await db.query("select * from public.wallet_movements")).rows).toHaveLength(0);
});

it("keeps payout approval pending and credits only the collected amount less its fee", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  await db.exec(`insert into ninja_connectors(id,owner_user_id,connector_version,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at) values('88888888-8888-4888-8888-888888888888','${i.owner}','17','test-access',now()+interval '1 day','test-refresh',now()+interval '1 day');
    insert into ninja_account_links(account_id,connector_id,machine_id,connection_name,external_account_name,first_seen_at,linked_by,phase,accounting_phase) values('${i.account}','88888888-8888-4888-8888-888888888888','fixture','SIM','FUND-001',now(),'${i.owner}','Funded','Primera vuelta');`);
  await db.exec(`insert into ninja_inventory_snapshots(event_id,machine_id,connector_id,observed_at,accounts,account_count) values('fixture-inventory','fixture','88888888-8888-4888-8888-888888888888',now(),'[{"accountName":"LFE0509369601055","connectionName":"Lucid","cashValue":49996.50}]',1)`);
  const registration = await prepare("register_account", { company_id: i.company, connector_id: "88888888-8888-4888-8888-888888888888", external_account_name: "LFE0509369601055", connection_name: "Lucid", first_seen_at: `${date}T12:00:00Z`, purchased_on: date, price_cents: 9000, funds_origin: "Aporte trader", wallet_id: "", phase: "Evaluacion", completed_days: 1 });
  await db.query("select apply_nodalito_repair($1)", [registration]);
  expect((await db.query("select * from ninja_account_links where external_account_name='LFE0509369601055' and completed_trade_days=1")).rows).toHaveLength(1);
  await db.exec(`select set_config('request.jwt.claim.sub','${i.master}',false); select set_config('request.jwt.claims','{"aal":"aal2"}',false)`);
  expect((await db.query<{ value: { status: string } }>("select revert_nodalito_repair($1) value", [registration])).rows[0].value.status).toBe("reverted");
  expect((await db.query("select * from ninja_account_links where external_account_name='LFE0509369601055'")).rows).toHaveLength(0);
  expect((await db.query("select * from ninja_account_ownership where account_name='LFE0509369601055'")).rows).toHaveLength(0);
  await db.exec(`select set_config('request.jwt.claim.sub','${i.owner}',false); select set_config('request.jwt.claims','{"aal":"aal1"}',false)`);
  const recovery = { account_ids: [i.account], operated_on: date, phase: "Primera vuelta", balance_before_cents: 100000, balance_cents: 90000, after_control_id: "", evidence_note: "Saldos y participante confirmados por el usuario" };
  await db.query("select apply_nodalito_repair($1)", [await prepare("recover_operation", recovery)]);
  await db.query("select apply_nodalito_repair($1)", [await prepare("account_progress", { account_id: i.account, phase: "Primera vuelta", completed_days: 2 })]);
  expect((await db.query<{ value: number }>("select completed_trade_days value from ninja_account_links where account_id=$1", [i.account])).rows[0].value).toBe(1);
  await db.query("select apply_nodalito_repair($1)", [await prepare("approve_payout", { account_id: i.account, approved_on: date, amount_cents: 30000 })]);
  const payout = (await db.query<{ id: string; collected_on: string | null }>("select id,collected_on from funding_withdrawals")).rows[0];
  expect(payout.collected_on).toBeNull();
  expect((await db.query("select * from account_phase_withdrawals")).rows).toHaveLength(0);
  const plan = await prepare("collect_payout", { withdrawal_id: payout.id, wallet_id: i.wallet, collected_on: date, fee_cents: 1500 });
  await db.query("select apply_nodalito_repair($1)", [plan]);
  expect((await db.query<{ value: number }>("select calculate_nodal_wallet_balance($1)::int value", [i.wallet])).rows[0].value).toBe(128500);
  expect((await db.query<{ value: number }>("select total_withdrawal_cents::int value from account_phase_withdrawals")).rows[0].value).toBe(30000);
  await db.exec(`select set_config('request.jwt.claim.sub','${i.master}',false); select set_config('request.jwt.claims','{"aal":"aal2"}',false)`);
  expect((await db.query<{ value: { status: string } }>("select revert_nodalito_repair($1) value", [plan])).rows[0].value.status).toBe("reverted");
  expect((await db.query("select * from account_phase_withdrawals")).rows).toHaveLength(0);
});
it("simulates the real wallet procedure, rolls it back, then applies once", async () => {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  const params = { wallet_id: i.wallet, occurred_on: date, kind: "external_contribution", amount_cents: 10000, fee_cents: 0 };
  const plan = (await db.query<{ id: string }>("select public.prepare_nodalito_repair($1,'wallet_movement',$2) id", [i.period, params])).rows[0].id;
  const preview = (await db.query<{ value: { status: string; failure: string | null } }>("select public.get_nodalito_repair($1) value", [plan])).rows[0].value;
  expect(preview.failure).toBeNull();
  expect(preview.status).toBe("ready");
  expect((await db.query("select * from public.wallet_movements")).rows).toHaveLength(0);
  await db.query("select public.apply_nodalito_repair($1)", [plan]);
  await db.query("select public.apply_nodalito_repair($1)", [plan]);
  expect((await db.query("select * from public.wallet_movements")).rows).toHaveLength(1);
  expect((await db.query("select * from public.nodal_agent_cases")).rows).toHaveLength(1);
});
