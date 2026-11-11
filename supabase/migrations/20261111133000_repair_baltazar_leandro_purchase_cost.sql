-- Baltazar cargó las cinco cuentas de la identidad Leandro después del E1 e
-- incluyó ese resultado en el precio informado (117,60 + 66,15 = 183,75).
-- El E1 fue recuperado después como operación, por lo que se corrige sólo el
-- costo de compra y se conserva íntegra la conciliación de -330,74.

begin;

do $repair$
declare
  baltazar_id constant uuid := '42c42ea2-c9a9-41c6-8604-5804982c1f50';
  leandro_identity_id constant uuid := 'c20607b9-7e4c-4eb2-92d9-ece832dc36db';
  admin_id constant uuid := 'f2f5f816-ec4f-46e1-b216-5267aeadc635';
  target_account_ids uuid[];
  changed_count integer;
  e1_total bigint;
begin
  select array_agg(accounts.id order by accounts.reference_number)
  into target_account_ids
  from public.accounts accounts
  join public.workspaces workspaces on workspaces.id = accounts.workspace_id
  join public.identity_account_assignments assignments
    on assignments.account_id = accounts.id
   and assignments.identity_id = leandro_identity_id
   and assignments.unassigned_at is null
  where workspaces.owner_user_id = baltazar_id
    and accounts.reference_number between 36 and 40;

  if coalesce(array_length(target_account_ids, 1), 0) <> 5 then
    raise exception 'Expected Baltazar Leandro accounts 36-40';
  end if;

  if (
    select count(*)
    from public.purchases purchases
    where purchases.account_id = any(target_account_ids)
      and purchases.price_cents = 11760
  ) = 5 and exists (
    select 1
    from public.audit_events events
    where events.action = 'baltazar_leandro_embedded_e1_removed_from_purchase'
      and events.entity_id = leandro_identity_id
  ) then
    return;
  end if;

  if (
    select count(*)
    from public.purchases purchases
    where purchases.account_id = any(target_account_ids)
      and purchases.price_cents = 18375
      and purchases.purchased_on = date '2026-11-09'
  ) <> 5 then
    raise exception 'Expected five Leandro purchases at 183.75 on 2026-11-09';
  end if;

  select sum(case entries.destination
    when 'NETO BROKER +' then entries.magnitude_cents
    else -entries.magnitude_cents
  end)
  into e1_total
  from public.operation_entries entries
  where entries.account_id = any(target_account_ids)
    and entries.operated_on = date '2026-11-06';

  if e1_total is distinct from -33074 then
    raise exception 'Expected the reconciled Leandro E1 total of -330.74, got %', e1_total;
  end if;

  update public.purchases purchases
  set price_cents = 11760,
      updated_by = admin_id,
      updated_at = now()
  where purchases.account_id = any(target_account_ids)
    and purchases.price_cents = 18375;
  get diagnostics changed_count = row_count;

  if changed_count <> 5 then
    raise exception 'Expected to correct five purchases, corrected %', changed_count;
  end if;

  insert into public.audit_events(
    actor_user_id, entity_table, entity_id, action,
    previous_data, current_data, reason
  ) values (
    admin_id,
    'nodal_identities',
    leandro_identity_id,
    'baltazar_leandro_embedded_e1_removed_from_purchase',
    jsonb_build_object(
      'account_ids', target_account_ids,
      'purchase_price_cents_each', 18375,
      'e1_result_cents_total', e1_total
    ),
    jsonb_build_object(
      'account_ids', target_account_ids,
      'purchase_price_cents_each', 11760,
      'e1_result_cents_total', e1_total
    ),
    'Se retiró del costo de compra el E1 que ya estaba conciliado por separado'
  );
end
$repair$;

commit;
