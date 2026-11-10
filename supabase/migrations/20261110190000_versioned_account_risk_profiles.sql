-- Las reglas de riesgo pertenecen a la vida de la cuenta y no se reinterpretan
-- cuando una prop modifica su oferta. Todas las nuevas Lucid desde este corte
-- usan la configuración Flex 50K confirmada por Dirección.

alter table public.accounts
  add column if not exists risk_rule_version text,
  add column if not exists risk_configuration jsonb,
  add column if not exists risk_configuration_recorded_at timestamptz;

alter table public.accounts
  add constraint accounts_risk_configuration_complete check (
    (risk_rule_version is null and risk_configuration is null and risk_configuration_recorded_at is null)
    or (nullif(btrim(risk_rule_version), '') is not null
      and jsonb_typeof(risk_configuration) = 'object'
      and risk_configuration_recorded_at is not null)
  );

create or replace function public.assign_default_account_risk_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare company_code text;
begin
  if new.risk_rule_version is not null or new.risk_configuration is not null then
    return new;
  end if;
  select companies.code into company_code
  from public.companies where companies.id = new.company_id;
  if company_code = 'LUCID' then
    new.risk_rule_version := 'lucid-flex-50k-2026-11-10';
    new.risk_configuration := jsonb_build_object(
      'accountSizeInCents', 5000000,
      'product', 'Flex',
      'profitTargetInCents', 300000,
      'maxLossLimitInCents', 200000,
      'drawdownType', 'EOD',
      'lockedMaxLossBalanceInCents', 5010000,
      'dailyLossLimit', jsonb_build_object('enabled', true, 'amountInCents', 120000, 'mode', 'soft'),
      'consistencyPercent', 50,
      'onDemandPayouts', true,
      'maxMinis', 4,
      'maxMicros', 40
    );
    new.risk_configuration_recorded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_assign_default_risk_profile on public.accounts;
create trigger accounts_assign_default_risk_profile
before insert on public.accounts
for each row execute function public.assign_default_account_risk_profile();

revoke all on function public.assign_default_account_risk_profile()
from public, anon, authenticated;

comment on column public.accounts.risk_configuration is
  'Instantánea inmutable de las reglas comerciales y de riesgo vigentes al crear la cuenta.';
