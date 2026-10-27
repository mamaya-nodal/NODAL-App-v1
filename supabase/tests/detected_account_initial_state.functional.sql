begin;

do $$
begin
  if public.nodal_detected_ninja_phase('LFF05091986490004') <> 'Funded' then
    raise exception 'LFF_PHASE_REGRESSION';
  end if;
  if public.nodal_detected_ninja_phase('LFE05091986490004') <> 'Evaluation' then
    raise exception 'LFE_PHASE_REGRESSION';
  end if;
  if public.nodal_detected_ninja_phase('LFL05091986490004') <> 'Live' then
    raise exception 'LFL_PHASE_REGRESSION';
  end if;
  if public.nodal_detected_ninja_initial_balance_cents('LFF05091986490004') <> 5000000 then
    raise exception 'LUCID_INITIAL_BALANCE_REGRESSION';
  end if;
  if public.nodal_detected_ninja_initial_balance_cents('TDFYSL25759067926') <> 2500000 then
    raise exception 'TRADEIFY_25K_INITIAL_BALANCE_REGRESSION';
  end if;
end;
$$;

rollback;
