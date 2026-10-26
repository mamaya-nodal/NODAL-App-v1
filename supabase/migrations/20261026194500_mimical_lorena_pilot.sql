-- Amplía el piloto personal de MIMICAL a Lorena Mariel Malagreca sin habilitar
-- instalaciones de identidades. La restricción equivalente existe en la app.

insert into public.addon_entitlements(product_key, owner_user_id)
values ('mimical', '2b0f63da-bf32-41ee-86c2-98fb5dbe583b')
on conflict (product_key, owner_user_id, (coalesce(identity_id, '00000000-0000-0000-0000-000000000000'::uuid)))
do update set status = 'active', revoked_at = null;
