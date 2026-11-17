-- A dismissed historical inference must never close a newly restored link.
begin;
create schema if not exists private_legacy_burn_guard_20261117;
revoke all on schema private_legacy_burn_guard_20261117 from public,anon,authenticated;
create table if not exists private_legacy_burn_guard_20261117.functions_before(name text primary key,definition text not null);
alter table private_legacy_burn_guard_20261117.functions_before enable row level security;
revoke all on private_legacy_burn_guard_20261117.functions_before from public,anon,authenticated;
do $$ declare original text; changed text; begin
 select pg_get_functiondef('public.apply_historical_ninja_burn_on_link()'::regprocedure) into original;
 insert into private_legacy_burn_guard_20261117.functions_before values('apply_historical_ninja_burn_on_link',original) on conflict do nothing;
 if position('NODAL_DISMISSED_BURN_GUARD' in original)=0 then
 changed:=replace(original,'and events.automatic',E'and events.automatic\n    and events.resolution_status <> ''dismissed'' /* NODAL_DISMISSED_BURN_GUARD */');
 if changed=original then raise exception 'HISTORICAL_BURN_DEFINITION_CHANGED'; end if;
 execute changed;
 end if;
end$$;
commit;
