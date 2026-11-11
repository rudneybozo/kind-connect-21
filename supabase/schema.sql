-- =====================================================================
-- Vendas CRM (Kind Connect) — banco de dados completo
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode rodar de novo sem problema: o script não duplica nada.
-- =====================================================================

-- E-mail que vira administrador automaticamente ao criar a conta
create or replace function public.admin_email()
returns text language sql immutable set search_path = public as $$ select 'rudneybozo@gmail.com'::text $$;

-- Atualiza a coluna updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- LOJAS (departamentos)
-- ---------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.stores (name) values ('Incoplim'), ('Bem Limp'), ('Cometa')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- PERFIS (um por usuário: papel, loja, se está liberado)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'vendedor' check (role in ('admin', 'vendedor')),
  store_id uuid references public.stores(id) on delete set null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o perfil quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_is_admin boolean := lower(new.email) = lower(public.admin_email());
begin
  begin
    v_store := nullif(new.raw_user_meta_data ->> 'store_id', '')::uuid;
  exception when others then
    v_store := null;
  end;
  if v_store is not null and not exists (select 1 from public.stores where id = v_store) then
    v_store := null;
  end if;

  insert into public.profiles (id, email, full_name, role, store_id, active)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when v_is_admin then 'admin' else 'vendedor' end,
    v_store,
    v_is_admin
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfis para usuários que já existiam antes deste script
insert into public.profiles (id, email, role, active)
select u.id, u.email,
  case when lower(u.email) = lower(public.admin_email()) then 'admin' else 'vendedor' end,
  lower(u.email) = lower(public.admin_email())
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Funções de permissão
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- vendedor responsável
  store_id uuid references public.stores(id) on delete set null,
  name text not null,
  company text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients add column if not exists store_id uuid references public.stores(id) on delete set null;
create index if not exists clients_user_id_idx on public.clients(user_id);
create index if not exists clients_store_id_idx on public.clients(store_id);
drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Vendedor só acessa os próprios clientes; admin acessa todos
create or replace function public.can_access_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.is_active_user() and exists (
      select 1 from public.clients c where c.id = p_client_id and c.user_id = auth.uid()
    )
  );
$$;

-- ---------------------------------------------------------------------
-- VISITAS / CONTATOS
-- ---------------------------------------------------------------------
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- quem registrou
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null default 'visita',
  happened_at timestamptz not null,
  contact_person text,
  notes text,
  follow_up_at timestamptz,
  follow_up_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interactions_client_idx on public.interactions(client_id);
create index if not exists interactions_followup_idx on public.interactions(follow_up_done, follow_up_at);
drop trigger if exists interactions_updated_at on public.interactions;
create trigger interactions_updated_at before update on public.interactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- VENDAS
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade, -- quem registrou
  client_id uuid not null references public.clients(id) on delete cascade,
  sold_at timestamptz not null default now(),
  amount numeric(12,2),
  description text,
  post_sale_due_at timestamptz not null default (now() + interval '3 days'),
  post_sale_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_client_idx on public.sales(client_id);
create index if not exists sales_postsale_idx on public.sales(post_sale_done_at, post_sale_due_at);
drop trigger if exists sales_updated_at on public.sales;
create trigger sales_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- PERMISSÕES (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.interactions enable row level security;
alter table public.sales enable row level security;

grant select on public.stores to anon, authenticated;
grant insert, update, delete on public.stores to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.clients, public.interactions, public.sales to authenticated;
grant all on public.stores, public.profiles, public.clients, public.interactions, public.sales to service_role;

-- Remove regras antigas (do Lovable ou de execuções anteriores)
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('stores', 'profiles', 'clients', 'interactions', 'sales')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Lojas: qualquer um vê as ativas (para escolher no cadastro); admin vê e altera todas
create policy stores_select on public.stores for select to authenticated
  using (active or public.is_admin());
create policy stores_select_anon on public.stores for select to anon
  using (active);
create policy stores_insert on public.stores for insert to authenticated with check (public.is_admin());
create policy stores_update on public.stores for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy stores_delete on public.stores for delete to authenticated using (public.is_admin());

-- Perfis: cada um vê o seu; admin vê todos. Alterações só pelas funções abaixo.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Clientes
create policy clients_select on public.clients for select to authenticated
  using (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));
create policy clients_update on public.clients for update to authenticated
  using (public.is_admin() or (public.is_active_user() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));

-- Visitas e vendas seguem o acesso ao cliente
create policy interactions_select on public.interactions for select to authenticated
  using (public.can_access_client(client_id));
create policy interactions_insert on public.interactions for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_client(client_id));
create policy interactions_update on public.interactions for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy interactions_delete on public.interactions for delete to authenticated
  using (public.can_access_client(client_id));

create policy sales_select on public.sales for select to authenticated
  using (public.can_access_client(client_id));
create policy sales_insert on public.sales for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_client(client_id));
create policy sales_update on public.sales for update to authenticated
  using (public.can_access_client(client_id)) with check (public.can_access_client(client_id));
create policy sales_delete on public.sales for delete to authenticated
  using (public.can_access_client(client_id));

-- ---------------------------------------------------------------------
-- FUNÇÕES DO ADMINISTRADOR E DO USUÁRIO
-- ---------------------------------------------------------------------

-- Admin altera papel, loja, nome e liberação de um usuário
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role text,
  p_store_id uuid,
  p_active boolean,
  p_full_name text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar usuários';
  end if;
  if p_role not in ('admin', 'vendedor') then
    raise exception 'Papel inválido';
  end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'Você não pode remover o seu próprio acesso de administrador';
  end if;
  update public.profiles
     set role = p_role,
         store_id = p_store_id,
         active = p_active,
         full_name = nullif(trim(p_full_name), '')
   where id = p_user_id;
end;
$$;

-- Admin exclui um usuário (e todos os clientes dele)
create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem excluir usuários';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

-- Admin transfere todos os clientes de um vendedor para outro
create or replace function public.admin_transfer_clients(p_from uuid, p_to uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem transferir clientes';
  end if;
  update public.clients
     set user_id = p_to,
         store_id = coalesce((select store_id from public.profiles where id = p_to), store_id)
   where user_id = p_from;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Usuário altera o próprio nome
create or replace function public.update_my_name(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set full_name = nullif(trim(p_full_name), '') where id = auth.uid();
end;
$$;

revoke all on function public.admin_update_user(uuid, text, uuid, boolean, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_transfer_clients(uuid, uuid) from public, anon;
revoke all on function public.update_my_name(text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_transfer_clients(uuid, uuid) to authenticated;
grant execute on function public.update_my_name(text) to authenticated;
grant execute on function public.is_admin(), public.is_active_user(), public.can_access_client(uuid) to authenticated;

-- Funções internas: não ficam expostas para quem não está logado
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.can_access_client(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_active_user(), public.can_access_client(uuid) to authenticated;
