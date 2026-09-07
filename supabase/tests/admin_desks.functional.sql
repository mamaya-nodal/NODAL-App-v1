-- Transactional integration test; requires one existing active Master. Always rolls back.
begin;
do $test$
declare owner uuid; target uuid; m date:=date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date; root uuid:='00000000-0000-4000-8000-000000000001';
begin
 select id into owner from public.nodal_users where access_role='admin' and access_state='active' limit 1;
 if owner is null then raise exception 'Test needs existing master'; end if;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform public.admin_save_user_terms(owner,m,root,2,'active',3000,true);
 target:=public.admin_save_desk(null,'TEST ROLLBACK',root,owner,m,3000,true);
 if (select desk_id from public.nodal_user_terms where user_id=owner and effective_month=m)<>root then raise exception 'Manager moved automatically'; end if;
 begin
  perform public.admin_save_desk(null,'DUPLICATE TEST',root,owner,m,3000,true);
  raise exception 'Duplicate manager accepted';
 exception when others then if sqlerrm<>'ALREADY_MANAGES_DESK' then raise; end if; end;
 begin
  perform public.admin_save_user_terms(owner,(m-interval '1 month')::date,root,2,'active',3000,true);
  raise exception 'Historical mutation accepted';
 exception when others then if sqlerrm<>'INVALID_EFFECTIVE_MONTH' then raise; end if; end;
 perform public.admin_save_user_terms(owner,m,target,2,'active',3000,true);
 if (select count(*) from public.nodal_management_history where user_id=owner)<3 then raise exception 'Audit missing'; end if;
 begin
  perform public.admin_save_desk(target,'TEST',root,owner,m,3000,false);
  raise exception 'Populated desk deactivated';
 exception when others then if sqlerrm<>'DESK_HAS_MEMBERS' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.admin_save_user_terms(owner,m,root,2,'active',0,true);
  raise exception 'Unauthenticated write accepted';
 exception when others then if sqlerrm<>'ADMIN_REQUIRED' then raise; end if; end;
end $test$;
set local role authenticated;
do $test$ begin
 if exists(select 1 from public.nodal_desks) then raise exception 'RLS exposed desks'; end if;
 begin
  update public.nodal_user_terms set commission_bps=0;
  raise exception 'Direct write allowed';
 exception when insufficient_privilege then null; end;
end $test$;
rollback;
