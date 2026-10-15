-- One private budget per Supabase Auth user. Amounts are integer kopecks.
create table public.lad_budgets (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision>=0),
 created_at timestamptz not null default now()
);
create table public.lad_categories (
 owner_id uuid not null references public.lad_budgets(owner_id) on delete cascade,
 id text not null check(length(id) between 1 and 100),
 name text not null check(length(trim(name)) between 1 and 60),
 kind text not null check(kind in ('income','expense')),
 color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),
 icon text not null check(length(icon) between 1 and 12),
 archived integer not null default 0 check(archived in (0,1)),
 primary key(owner_id,id), unique(owner_id,id,kind)
);
create table public.lad_operations (
 owner_id uuid not null references public.lad_budgets(owner_id) on delete cascade,
 id text not null check(length(id) between 1 and 100),
 category_id text not null,
 kind text not null check(kind in ('income','expense')),
 amount bigint not null check(amount between 1 and 999999999999),
 date date not null check(date between date '1900-01-01' and date '2200-12-31'),
 comment text not null default '' check(length(comment)<=1000),
 primary key(owner_id,id),
 foreign key(owner_id,category_id,kind) references public.lad_categories(owner_id,id,kind)
);
create index lad_operations_category_idx on public.lad_operations(owner_id,category_id,kind);
create index lad_operations_date_idx on public.lad_operations(owner_id,date);
create table public.lad_backups (
 owner_id uuid not null references public.lad_budgets(owner_id) on delete cascade,
 date date not null default ((now() at time zone 'Europe/Moscow')::date),
 snapshot jsonb not null,
 primary key(owner_id,date)
);
alter table public.lad_budgets enable row level security;
alter table public.lad_categories enable row level security;
alter table public.lad_operations enable row level security;
alter table public.lad_backups enable row level security;
create policy own_budget on public.lad_budgets to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy own_categories on public.lad_categories to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy own_operations on public.lad_operations to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy own_backups on public.lad_backups to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.lad_budgets,public.lad_categories,public.lad_operations,public.lad_backups from anon;
grant select,insert,update,delete on public.lad_budgets,public.lad_categories,public.lad_operations,public.lad_backups to authenticated;

create function public.lad_read() returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); added uuid; answer jsonb;
begin
 if u is null then raise exception 'Требуется вход в аккаунт'; end if;
 insert into public.lad_budgets(owner_id) values(u) on conflict do nothing returning owner_id into added;
 if added is not null then
  insert into public.lad_categories(owner_id,id,name,kind,color,icon)
  select u,x->>0,x->>1,x->>2,x->>3,x->>4 from jsonb_array_elements(
  '[["salary","Зарплата","income","#159d89","💼"],["side","Подработка","income","#4c7deb","🛠️"],["gift","Подарки","income","#b67cd8","🎁"],["other-income","Прочее","income","#8493a7","✨"],["food","Продукты","expense","#e79a45","🥑"],["home","Жильё","expense","#5278db","🏠"],["transport","Транспорт","expense","#53a6b8","🚋"],["health","Здоровье","expense","#cf748d","❤️"],["education","Образование","expense","#9b80d0","📚"],["fun","Развлечения","expense","#dcaf4b","🎟️"],["other","Прочее","expense","#8493a7","📦"]]'::jsonb) x;
 end if;
 select jsonb_build_object(
 'revision',b.revision,'user',coalesce(auth.jwt()->>'email','Ваш бюджет'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'kind',c.kind,'color',c.color,'icon',c.icon,'archived',c.archived) order by c.kind,c.name) from public.lad_categories c where c.owner_id=u),'[]'::jsonb),
 'operations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'categoryId',o.category_id,'kind',o.kind,'amount',o.amount,'date',o.date,'comment',o.comment) order by o.date,o.id) from public.lad_operations o where o.owner_id=u),'[]'::jsonb),
 'messages','[]'::jsonb,'consent',false) into answer from public.lad_budgets b where b.owner_id=u;
 return answer;
end $$;

-- Revision check prevents another device or tab from silently overwriting edits.
-- Replacement and snapshot run in one transaction; malformed imports roll back.
create function public.lad_commit(p_revision bigint,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); current_version bigint; old_data jsonb; x jsonb; d date;
begin
 if u is null then raise exception 'Требуется вход в аккаунт'; end if;
 perform public.lad_read();
 select revision into current_version from public.lad_budgets where owner_id=u for update;
 if current_version<>p_revision or p_revision is null then
  raise exception 'Бюджет изменён на другом устройстве. Обновите страницу и повторите действие.' using errcode='40001';
 end if;
 if p_data is null or jsonb_typeof(p_data->'categories') is distinct from 'array' or jsonb_typeof(p_data->'operations') is distinct from 'array' then raise exception 'Некорректный формат бюджета'; end if;
 if octet_length(p_data::text)>5000000 or jsonb_array_length(p_data->'categories')>200 or jsonb_array_length(p_data->'operations')>5000 then raise exception 'Лимит: 200 категорий и 5000 операций, 5 МБ'; end if;
 for x in select value from jsonb_array_elements(p_data->'categories') loop
  if jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'name') is distinct from 'string'
   or jsonb_typeof(x->'kind') is distinct from 'string' or jsonb_typeof(x->'icon') is distinct from 'string'
   or jsonb_typeof(x->'color') is distinct from 'string' or coalesce(x->>'archived','') not in ('0','1')
  then raise exception 'Некорректная категория'; end if;
 end loop;
 for x in select value from jsonb_array_elements(p_data->'operations') loop
  if jsonb_typeof(x->'id') is distinct from 'string' or jsonb_typeof(x->'categoryId') is distinct from 'string'
   or jsonb_typeof(x->'comment') is distinct from 'string' or jsonb_typeof(x->'kind') is distinct from 'string'
   or jsonb_typeof(x->'amount') is distinct from 'number' or coalesce(x->>'amount','') !~ '^[0-9]{1,12}$'
   or coalesce(x->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Некорректная операция'; end if;
  d:=(x->>'date')::date;
  if to_char(d,'YYYY-MM-DD')<>x->>'date' then raise exception 'Некорректная дата'; end if;
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
revoke all on function public.lad_read() from public,anon;
revoke all on function public.lad_commit(bigint,jsonb) from public,anon;
grant execute on function public.lad_read() to authenticated;
grant execute on function public.lad_commit(bigint,jsonb) to authenticated;
