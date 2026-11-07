import { readFileSync } from "node:fs";
import { createAccountingDatabase } from "./accounting-database";
export const fixtureIds = { owner: "11111111-1111-4111-8111-111111111111", master: "22222222-2222-4222-8222-222222222222", period: "33333333-3333-4333-8333-333333333333", workspace: "44444444-4444-4444-8444-444444444444", wallet: "55555555-5555-4555-8555-555555555555", company: "66666666-6666-4666-8666-666666666666", account: "77777777-7777-4777-8777-777777777777" };
export async function repairFixture() {
  const { db } = await createAccountingDatabase();
  const i = fixtureIds;
  try {
    for (const name of ["20261106170000_nodalito_repair_workflow.sql", "20261106171000_nodalito_repair_journal.sql", "20261106172000_nodalito_historical_recovery.sql", "20261106173000_nodalito_repair_reversal.sql", "20261106174000_nodalito_audit_rounds.sql", "20261106175000_nodalito_context.sql"]) await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
    await db.exec(`
      alter table auth.users disable trigger user;
      insert into auth.users(id,email) values('${i.owner}','trader@example.test'),('${i.master}','master@example.test');
      insert into public.nodal_users(id,email,access_state,authorized_at) values('${i.owner}','trader@example.test','active',now()),('${i.master}','master@example.test','active',now());
      update public.nodal_users set access_role='admin' where id='${i.master}';
      insert into public.workspaces(id,owner_user_id,modality) values('${i.workspace}','${i.owner}','real');
      insert into public.periods(id,workspace_id,period_month,lifecycle_status) values('${i.period}','${i.workspace}',public.nodal_accounting_period_month(now()),'open');
      insert into public.companies(id,code,display_name) values('${i.company}','LUCID','Lucid');
      insert into public.accounts(id,period_id,workspace_id,company_id,reference_number,created_by) values('${i.account}','${i.period}','${i.workspace}','${i.company}',1,'${i.owner}');
      insert into public.purchases(period_id,account_id,purchase_number,purchased_on,price_cents,funds_origin,created_by) values('${i.period}','${i.account}',1,current_date,13000,'Aporte trader','${i.owner}');
      insert into public.nodal_wallets(id,workspace_id,name,created_by) values('${i.wallet}','${i.workspace}','Billetera de prueba','${i.owner}');
      insert into public.period_opening_snapshots(period_id,start_mode,cutover_date,broker_balance_cents,wallet_balance_cents,contributed_capital_cents,created_by)
      values('${i.period}','zero',current_date,100000,100000,100000,'${i.owner}');
      insert into public.period_opening_wallets(opening_snapshot_id,wallet_id,balance_cents) select id,'${i.wallet}',100000 from public.period_opening_snapshots where period_id='${i.period}';
      insert into public.nodalito_repair_access(user_id,enabled) values('${i.owner}',true);
      select set_config('request.jwt.claim.sub','${i.owner}',false);
      select set_config('request.jwt.claims','{"aal":"aal1"}',false);
    `);
    return db;
  } catch (error) { await db.close(); const detail = error as { message?: string; position?: string; internalQuery?: string; where?: string }; throw new Error(JSON.stringify(detail, ["message", "position", "internalQuery", "where"])); }
}
