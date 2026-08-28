insert into public.companies (code, display_name)
values
  ('MFF', 'My Funded Futures'),
  ('TOPSTEP', 'Topstep'),
  ('FUNDEDNEXT', 'FundedNext'),
  ('TPT', 'Take Profit Trader')
on conflict (code) do update
set display_name = excluded.display_name;
