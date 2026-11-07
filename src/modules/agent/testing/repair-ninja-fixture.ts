import type { PGlite } from "@electric-sql/pglite";
import { fixtureIds as i } from "./repair-fixture";
export async function ninjaBatchFixture(db: PGlite, ready: boolean, opening = 1000) {
  const connector = "88888888-8888-4888-8888-888888888888";
  await db.exec(`insert into ninja_connectors(id,owner_user_id,connector_version,access_token_hash,access_expires_at,refresh_token_hash,refresh_expires_at) values('${connector}','${i.owner}','0.17','test-access',now()+interval '1 day','test-refresh',now()+interval '1 day');`);
  const sessions: number[] = [];
  for (const name of ["BROKER-TEST", "PROP-TEST"]) {
    const event = (await db.query<{ id: number }>("insert into ninja_trade_telemetry_events(connector_id,event_id,event_type,occurred_at,connection_name,account_name,payload) values($1,$2,'execution',now(),'Test',$2,'{}') returning id", [connector,name])).rows[0].id;
    sessions.push((await db.query<{ id: number }>("insert into ninja_operation_probe_sessions(connector_id,connection_name,account_name,opening_event_id,opened_at,last_event_at,settled_at,status,opening_balance,closing_balance,result) values($1,'Test',$2,$3,now(),now(),now(),'closed',$4,$5,-100) returning id", [connector,name,event,opening,opening-100])).rows[0].id);
  }
  const batch = (await db.query<{ id: string }>("insert into ninja_operation_batches(connector_id,broker_session_id,status,broker_result_cents,distributed_cents,opened_at,settled_at,accounting_status,accounting_period_id,accounting_company_id,accounting_phase,operated_on) values($1,$2,$3,-10000,$4,now(),now(),$5,$6,$7,'Evaluacion',current_date) returning id", [connector,sessions[0],ready ? "ready" : "unmatched",ready ? -10000 : 0,ready ? "shadow_ready" : "blocked",i.period,i.company])).rows[0].id;
  if (ready) await db.query("insert into ninja_operation_batch_members(batch_id,session_id,account_id,role,allocated_broker_result_cents) values($1,$2,$3,'prop',-10000)", [batch,sessions[1],i.account]);
  return batch;
}
