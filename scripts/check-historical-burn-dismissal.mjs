import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
await db.exec(`create role anon;create role authenticated;
create table accounts(id uuid primary key,state text,state_origin text);
create table ninja_connectors(id uuid primary key,owner_user_id uuid,status text);
create table ninja_account_change_events(id uuid default gen_random_uuid(),connector_id uuid,connection_name text,from_account_name text,event_type text,automatic boolean,resolution_status text,occurred_at timestamptz);
create table ninja_account_links(id uuid default gen_random_uuid(),connector_id uuid,account_id uuid,connection_name text,external_account_name text,first_seen_at timestamptz,closed_at timestamptz,closure_reason text);
create table audit_events(actor_user_id uuid,entity_table text,entity_id uuid,action text,current_data jsonb,reason text);
insert into ninja_connectors values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','active');`);
const source=readFileSync('supabase/migrations/20260915150000_ninja_late_account_assignment.sql','utf8');
await db.exec(source.slice(0,source.indexOf('-- Repara vínculos')));
let count=0;
async function exercise(name,resolution,automatic,eventAt,expected){
 const account='33333333-3333-4333-8333-'+String(++count).padStart(12,'0');
 await db.query(`insert into accounts values($1,'live','automatic')`,[account]);
 await db.query(`insert into ninja_account_change_events(connector_id,connection_name,from_account_name,event_type,automatic,resolution_status,occurred_at) values('11111111-1111-4111-8111-111111111111','Lucid',$1,'burned',$2,$3,$4)`,[name,automatic,resolution,eventAt]);
 await db.query(`insert into ninja_account_links(connector_id,account_id,connection_name,external_account_name,first_seen_at) values('11111111-1111-4111-8111-111111111111',$1,'Lucid',$2,'2026-11-03')`,[account,name]);
 const row=(await db.query(`select state,closed_at is not null closed from accounts a join ninja_account_links l on l.account_id=a.id where a.id=$1`,[account])).rows[0];
 assert.equal(row.closed,expected,name);assert.equal(row.state,expected?'closed':'live',name);
}
await exercise('before-fix-dismissed','dismissed',true,'2026-11-04',true);
await db.exec(readFileSync('supabase/migrations/20261117163000_ignore_dismissed_historical_burns.sql','utf8'));
await exercise('dismissed-stays-live','dismissed',true,'2026-11-04',false);
await exercise('real-burn-closes','automatic',true,'2026-11-04',true);
await exercise('unverified-does-not-close','pending',false,'2026-11-04',false);
await exercise('older-life-does-not-close','automatic',true,'2026-11-02',false);
await db.exec(readFileSync('supabase/migrations/20261117163000_ignore_dismissed_historical_burns.sql','utf8'));
await exercise('migration-idempotent','dismissed',true,'2026-11-04',false);
console.log('6 checks passed: original defect reproduced; dismissed, real, unverified, earlier-life and repeated-migration cases verified.');
} finally {await db.close();}
