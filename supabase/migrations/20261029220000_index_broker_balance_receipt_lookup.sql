-- La apertura consulta la última observación balance de una cuenta broker.
-- El índice parcial evita recorrer el ledger técnico completo a medida que crece.
create index concurrently if not exists ninja_event_receipts_broker_balance_lookup
  on public.ninja_event_receipts (
    physical_connector_id,
    (payload->>'connectionName'),
    (payload->>'accountName'),
    (payload->>'occurredAt') desc
  )
  where status in ('pending', 'persisted')
    and payload->>'kind' = 'balance';
