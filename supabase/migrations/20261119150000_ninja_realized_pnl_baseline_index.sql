-- Run outside an explicit transaction to avoid blocking telemetry inserts.
create index concurrently if not exists ninja_trade_realized_baseline_idx
on public.ninja_trade_telemetry_events (
  connector_id, physical_connector_id, connection_name, account_name, occurred_at desc, id desc
)
where event_type = 'balance' and (payload->>'realizedProfitLoss') is not null;
