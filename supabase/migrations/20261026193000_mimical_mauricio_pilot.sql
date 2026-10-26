-- Amplía el piloto personal de MIMICAL a Mauricio sin habilitar otros usuarios
-- ni identidades. La restricción equivalente también existe en la aplicación.

insert into public.addon_entitlements(product_key, owner_user_id)
values ('mimical', 'f2f5f816-ec4f-46e1-b216-5267aeadc635')
on conflict (product_key, owner_user_id, (coalesce(identity_id, '00000000-0000-0000-0000-000000000000'::uuid)))
do update set status = 'active', revoked_at = null;
