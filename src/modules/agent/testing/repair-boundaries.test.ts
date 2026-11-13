import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { repairFixture, fixtureIds as i } from "./repair-fixture";
let db: PGlite;
beforeAll(async () => { vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(new Date("2026-11-12T15:00:00Z")); db = await repairFixture(); }, 120000);
afterAll(async () => { if (db) await db.close(); vi.useRealTimers(); });
async function prepare(amount = 100) {
  const date = (await db.query<{ today: string }>("select current_date::text today")).rows[0].today;
  return (await db.query<{ id: string }>("select prepare_nodalito_repair($1,'wallet_movement',$2) id", [i.period, { wallet_id: i.wallet, occurred_on: date, kind: "external_contribution", amount_cents: amount, fee_cents: 0 }])).rows[0].id;
}
const apply = (id: string) => db.query("select apply_nodalito_repair($1)", [id]);
it("rejects stale proposals and keeps the ledger unchanged", async () => {
  const id = await prepare();
  await db.exec("update nodal_wallets set name='Renombrada'");
  await expect(apply(id)).rejects.toThrow("NODALITO_SNAPSHOT_CHANGED");
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(0);
});
it("rolls back the economic write when the private notification fails", async () => {
  const id = await prepare();
  await db.exec(`create function fail_notice() returns trigger language plpgsql as $$ begin raise exception 'notice_unavailable'; end $$;
    create trigger fail_notice before insert on nodal_agent_cases for each row execute function fail_notice();`);
  await expect(apply(id)).rejects.toThrow("notice_unavailable");
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(0);
  await db.exec("drop trigger fail_notice on nodal_agent_cases");
});
it("rejects another user's plan, including a master without MFA", async () => {
  const id = await prepare();
  await db.exec(`insert into nodalito_repair_access values('${i.master}',true); select set_config('request.jwt.claim.sub','${i.master}',false)`);
  try {
    await expect(apply(id)).rejects.toThrow("NODALITO_SCOPE_FORBIDDEN");
    await expect(prepare()).rejects.toThrow("NODALITO_SCOPE_FORBIDDEN");
    await expect(db.query("select revert_nodalito_repair($1)", [id])).rejects.toThrow("NODALITO_MASTER_MFA_REQUIRED");
  } finally { await db.exec(`select set_config('request.jwt.claim.sub','${i.owner}',false)`); }
});
it("keeps subsequent activity intact when a reversal conflicts", async () => {
  const id = await prepare(); await apply(id);
  await apply(await prepare(200));
  await db.exec(`select set_config('request.jwt.claim.sub','${i.master}',false); select set_config('request.jwt.claims','{"aal":"aal2"}',false)`);
  expect((await db.query<{ value: { status: string } }>("select revert_nodalito_repair($1) value", [id])).rows[0].value.status).toBe("needs_review");
  expect((await db.query("select * from wallet_movements")).rows).toHaveLength(2);
  await db.exec(`select set_config('request.jwt.claim.sub','${i.owner}',false); select set_config('request.jwt.claims','{"aal":"aal1"}',false)`);
});
it("rejects closed periods and disabled repairs", async () => {
  const id = await prepare(500);
  await db.exec("update periods set lifecycle_status='closed'");
  await expect(apply(id)).rejects.toThrow("ACCOUNTING_PERIOD_CLOSED");
  await db.exec("update periods set lifecycle_status='open'; update nodalito_repair_access set enabled=false");
  await expect(apply(id)).rejects.toThrow("NODALITO_REPAIRS_DISABLED");
});
