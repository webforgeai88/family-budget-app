create or replace function public.lad_commit(p_revision bigint,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); current_version bigint; old_data jsonb; item jsonb; d date;
begin
 if u is null then raise exception 'Требуется вход в аккаунт'; end if;
 perform public.lad_read();
 select revision into current_version from public.lad_budgets where owner_id=u for update;
 if current_version<>p_revision or p_revision is null then
  raise exception 'Бюджет изменён на другом устройстве. Обновите страницу и повторите действие.' using errcode='40001';
 end if;
 if p_data is null or jsonb_typeof(p_data->'categories') is distinct from 'array' or jsonb_typeof(p_data->'operations') is distinct from 'array' then raise exception 'Некорректный формат бюджета'; end if;
 if octet_length(p_data::text)>5000000 or jsonb_array_length(p_data->'categories')>200 or jsonb_array_length(p_data->'operations')>5000 then raise exception 'Лимит: 200 категорий и 5000 операций, 5 МБ'; end if;
 for item in select value from jsonb_array_elements(p_data->'categories') loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string'
   or jsonb_typeof(item->'kind') is distinct from 'string' or jsonb_typeof(item->'icon') is distinct from 'string'
   or jsonb_typeof(item->'color') is distinct from 'string' or coalesce(item->>'archived','') not in ('0','1')
  then raise exception 'Некорректная категория'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_data->'operations') loop
  if jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'categoryId') is distinct from 'string'
   or jsonb_typeof(item->'comment') is distinct from 'string' or jsonb_typeof(item->'kind') is distinct from 'string'
   or jsonb_typeof(item->'amount') is distinct from 'number' or coalesce(item->>'amount','') !~ '^[0-9]{1,12}$'
   or coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Некорректная операция'; end if;
  d:=(item->>'date')::date;
  if to_char(d,'YYYY-MM-DD')<>item->>'date' then raise exception 'Некорректная дата'; end if;
 end loop;
 old_data:=public.lad_read();
 insert into public.lad_backups(owner_id,snapshot) values(u,old_data) on conflict do nothing;
 delete from public.lad_operations where owner_id=u;
 delete from public.lad_categories where owner_id=u;
 insert into public.lad_categories(owner_id,id,name,kind,color,icon,archived)
 select u,x->>'id',x->>'name',x->>'kind',x->>'color',x->>'icon',(x->>'archived')::integer from jsonb_array_elements(p_data->'categories') x;
 insert into public.lad_operations(owner_id,id,category_id,kind,amount,date,comment)
 select u,x->>'id',x->>'categoryId',x->>'kind',(x->>'amount')::bigint,(x->>'date')::date,x->>'comment' from jsonb_array_elements(p_data->'operations') x;
 update public.lad_budgets set revision=revision+1 where owner_id=u;
 delete from public.lad_backups where owner_id=u and date not in (select date from public.lad_backups where owner_id=u order by date desc limit 30);
 return public.lad_read();
end $$;
