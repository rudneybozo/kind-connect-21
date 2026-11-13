-- =====================================================================
-- Vendas CRM — Migração 03
--   * Carteira do grupo: base única de clientes por CPF/CNPJ, pesquisável por todos
--   * Cada vendedor vê só as próprias visitas e vendas; admin vê tudo
--   * Aviso de atendimento (60 dias) com alerta só para administradores
--   * Venda: forma de pagamento, NF, loja do vendedor; pendência com quitação
--
-- Rode DEPOIS de schema.sql e 02_historico_e_exclusoes.sql. Preserva os dados existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Utilitários: só dígitos, texto sem acento, validação de CPF/CNPJ
-- ---------------------------------------------------------------------
create or replace function public.only_digits(t text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '');
$$;

create or replace function public.norm_text(t text)
returns text language sql immutable set search_path = public as $$
  select lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
$$;

create or replace function public.is_valid_cpf(doc text)
returns boolean language plpgsql immutable set search_path = public as $$
declare d text := public.only_digits(doc); s int; r int; i int;
begin
  if d is null or length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end;
$$;

create or replace function public.is_valid_cnpj(doc text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  d text := public.only_digits(doc);
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
begin
  if d is null or length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * w1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> substr(d, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * w2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = substr(d, 14, 1)::int;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Clientes: tipo, documento, razão social, pessoa de contato
-- ---------------------------------------------------------------------
alter table public.clients add column if not exists person_type text;
alter table public.clients add column if not exists document text;
alter table public.clients add column if not exists legal_name text;
alter table public.clients add column if not exists contact_person text;
alter table public.clients add column if not exists phone_digits text
  generated always as (public.only_digits(phone)) stored;

-- Dados antigos: "Empresa" vira razão social; sem documento continuam válidos até serem editados
update public.clients
   set person_type = case when nullif(trim(coalesce(company, '')), '') is not null then 'pj' else 'pf' end
 where person_type is null;
update public.clients
   set legal_name = company
 where legal_name is null and nullif(trim(coalesce(company, '')), '') is not null;

alter table public.clients alter column person_type set default 'pj';
alter table public.clients alter column person_type set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_person_type_check') then
    alter table public.clients add constraint clients_person_type_check check (person_type in ('pj', 'pf'));
  end if;
end $$;

create unique index if not exists clients_document_unique
  on public.clients(document) where document is not null and deleted_at is null;
create index if not exists clients_phone_digits_idx on public.clients(phone_digits) where deleted_at is null;

-- Regras do cadastro: CNPJ obrigatório para empresa, CPF opcional para pessoa física
create or replace function public.clients_validate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.store_id is null then
    new.store_id := (select store_id from public.profiles where id = new.user_id);
  end if;
  new.document := public.only_digits(new.document);
  new.name := trim(new.name);
  new.legal_name := nullif(trim(coalesce(new.legal_name, '')), '');
  new.contact_person := nullif(trim(coalesce(new.contact_person, '')), '');

  if new.person_type = 'pj' then
    if new.document is null then
      -- clientes antigos sem CNPJ continuam editáveis, mas um cadastro novo exige o CNPJ
      if tg_op = 'INSERT' or old.document is not null or old.person_type <> 'pj' then
        raise exception 'Informe o CNPJ da empresa';
      end if;
    elsif not public.is_valid_cnpj(new.document) then
      raise exception 'CNPJ inválido';
    end if;
  else
    if new.document is not null and not public.is_valid_cpf(new.document) then
      raise exception 'CPF inválido';
    end if;
  end if;

  if new.document is not null and exists (
    select 1 from public.clients c
    where c.document = new.document and c.deleted_at is null and c.id <> new.id
  ) then
    raise exception 'Já existe um cliente cadastrado com este %', case when new.person_type = 'pj' then 'CNPJ' else 'CPF' end;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_validate on public.clients;
create trigger clients_validate before insert or update of person_type, document, name, legal_name, contact_person, store_id
  on public.clients for each row execute function public.clients_validate();

-- ---------------------------------------------------------------------
-- 2. Visitas e vendas: loja do vendedor, motivo do aviso, forma de pagamento, NF, quitação
-- ---------------------------------------------------------------------
alter table public.interactions add column if not exists store_id uuid references public.stores(id) on delete set null;
alter table public.interactions add column if not exists conflict_reason text;

alter table public.sales add column if not exists store_id uuid references public.stores(id) on delete set null;
alter table public.sales add column if not exists conflict_reason text;
alter table public.sales add column if not exists payment_method text;
alter table public.sales add column if not exists nf_number text;
alter table public.sales add column if not exists nf_date date;
alter table public.sales add column if not exists settles_sale_id uuid references public.sales(id) on delete set null;
alter table public.sales add column if not exists settled_at timestamptz;
alter table public.sales add column if not exists settled_by_sale_id uuid references public.sales(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sales_payment_method_check') then
    alter table public.sales add constraint sales_payment_method_check
      check (payment_method is null or payment_method in ('dinheiro', 'cartao', 'pix', 'deposito', 'boleto', 'pendencia'));
  end if;
end $$;
create index if not exists sales_report_idx on public.sales(sold_at, payment_method) where deleted_at is null;
create index if not exists sales_user_idx2 on public.sales(user_id);
create index if not exists interactions_user_idx2 on public.interactions(user_id);

-- Registros antigos: loja = loja atual de quem registrou
update public.interactions i set store_id = p.store_id from public.profiles p where p.id = i.user_id and i.store_id is null;
update public.sales s set store_id = p.store_id from public.profiles p where p.id = s.user_id and s.store_id is null;

create or replace function public.payment_label(m text)
returns text language sql immutable set search_path = public as $$
  select case m
    when 'dinheiro' then 'Dinheiro' when 'cartao' then 'Cartão' when 'pix' then 'Pix'
    when 'deposito' then 'Depósito em conta' when 'boleto' then 'Boleto bancário'
    when 'pendencia' then 'Pendência' else 'Não informada' end;
$$;

-- Loja da venda/visita = loja do vendedor no momento do registro
create or replace function public.activity_set_store()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.store_id := (select store_id from public.profiles where id = new.user_id);
  new.conflict_reason := nullif(trim(coalesce(new.conflict_reason, '')), '');
  return new;
end;
$$;
drop trigger if exists interactions_set_store on public.interactions;
create trigger interactions_set_store before insert on public.interactions
  for each row execute function public.activity_set_store();
drop trigger if exists sales_set_store on public.sales;
create trigger sales_set_store before insert on public.sales
  for each row execute function public.activity_set_store();

create or replace function public.sales_validate()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nf_number := nullif(trim(coalesce(new.nf_number, '')), '');
  if tg_op = 'INSERT' and new.payment_method is null then
    raise exception 'Informe a forma de pagamento';
  end if;
  if tg_op = 'UPDATE' then
    if old.payment_method is not null and new.payment_method is null then
      raise exception 'Informe a forma de pagamento';
    end if;
    if old.settled_at is not null and (new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method) then
      raise exception 'Esta pendência já foi quitada e não pode mudar valor nem forma de pagamento';
    end if;
    if old.payment_method = 'pendencia' and new.payment_method is distinct from 'pendencia' then
      raise exception 'Para pendências, use o botão Quitar (informando a NF)';
    end if;
    if old.settles_sale_id is not null and new.payment_method = 'pendencia' then
      raise exception 'Uma quitação não pode virar pendência';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sales_validate on public.sales;
create trigger sales_validate before insert or update on public.sales
  for each row execute function public.sales_validate();

-- ---------------------------------------------------------------------
-- 3. Quem acessa o quê
-- ---------------------------------------------------------------------
-- Pode trabalhar com o cliente (registrar visita/venda): qualquer usuário liberado
create or replace function public.can_use_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and exists (
    select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null
  );
$$;

-- Tem atividade própria (visita ou venda) no cliente
create or replace function public.has_activity_on_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.interactions i where i.client_id = p_client_id and i.user_id = auth.uid() and i.deleted_at is null)
      or exists (select 1 from public.sales s where s.client_id = p_client_id and s.user_id = auth.uid() and s.deleted_at is null);
$$;

-- Enxerga o cliente na própria lista: admin, quem cadastrou ou quem já atendeu
create or replace function public.can_access_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client_id
      and c.deleted_at is null
      and (public.is_admin() or (public.is_active_user() and (c.user_id = auth.uid() or public.has_activity_on_client(c.id))))
  );
$$;

alter policy clients_select on public.clients
  using (deleted_at is null and (public.is_admin() or (public.is_active_user() and (user_id = auth.uid() or public.has_activity_on_client(id)))));
-- editar continua só para quem cadastrou e admin (clients_update inalterada)

alter policy interactions_select on public.interactions
  using (deleted_at is null and (public.is_admin() or (public.is_active_user() and user_id = auth.uid())));
alter policy interactions_insert on public.interactions
  with check (user_id = auth.uid() and public.can_use_client(client_id));
alter policy interactions_update on public.interactions
  using (deleted_at is null and (public.is_admin() or (public.is_active_user() and user_id = auth.uid())))
  with check (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));

alter policy sales_select on public.sales
  using (deleted_at is null and (public.is_admin() or (public.is_active_user() and user_id = auth.uid())));
alter policy sales_insert on public.sales
  with check (user_id = auth.uid() and public.can_use_client(client_id));
alter policy sales_update on public.sales
  using (deleted_at is null and (public.is_admin() or (public.is_active_user() and user_id = auth.uid())))
  with check (public.is_admin() or (public.is_active_user() and user_id = auth.uid()));

alter policy deletion_requests_select on public.deletion_requests
  using (public.is_admin() or requested_by = auth.uid());

-- Colunas: as observações do cliente só saem pela função client_card (dono e admin)
revoke select on public.clients from authenticated, anon;
grant select (id, user_id, store_id, person_type, document, name, legal_name, contact_person, phone, phone_digits,
              email, address, created_at, updated_at) on public.clients to authenticated;
grant insert (user_id, store_id, person_type, document, name, legal_name, contact_person, phone, email, address, notes)
  on public.clients to authenticated;
grant update (user_id, store_id, person_type, document, name, legal_name, contact_person, phone, email, address, notes)
  on public.clients to authenticated;

grant insert (conflict_reason) on public.interactions to authenticated;
grant insert (payment_method, nf_number, nf_date, conflict_reason) on public.sales to authenticated;
grant update (payment_method, nf_number, nf_date) on public.sales to authenticated;

-- ---------------------------------------------------------------------
-- 4. Base compartilhada: pesquisa, ficha resumida, duplicidade, aviso de 60 dias
-- ---------------------------------------------------------------------
create or replace function public.attendance_days()
returns int language sql immutable set search_path = public as $$ select 60 $$;

-- Último atendimento de OUTRO vendedor nos últimos 60 dias (cadastro, visita ou venda)
create or replace function public.last_other_attendance(p_client_id uuid, p_user uuid default null)
returns table (other_user_id uuid, other_name text, other_store text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select coalesce(p_user, auth.uid()) as uid),
  acts as (
    select c.user_id as uid, c.created_at as at from public.clients c where c.id = p_client_id and c.deleted_at is null
    union all
    select i.user_id, greatest(i.happened_at, i.created_at) from public.interactions i where i.client_id = p_client_id and i.deleted_at is null
    union all
    select s.user_id, greatest(s.sold_at, s.created_at) from public.sales s
      where s.client_id = p_client_id and s.deleted_at is null and s.settles_sale_id is null
  )
  select a.uid, public.person_name(a.uid), public.store_name((select store_id from public.profiles where id = a.uid)), a.at
  from acts a, me
  where a.uid <> me.uid
    and a.at >= now() - make_interval(days => public.attendance_days())
    and a.at <= now() + interval '1 day'
  order by a.at desc
  limit 1;
$$;

-- Aviso para a tela (antes de agendar/vender)
create or replace function public.client_attendance_check(p_client_id uuid)
returns table (other_name text, other_store text, last_at timestamptz, days_ago int)
language sql stable security definer set search_path = public as $$
  select l.other_name, l.other_store, l.last_at, greatest(0, ((now() at time zone 'America/Campo_Grande')::date - (l.last_at at time zone 'America/Campo_Grande')::date))::int
  from public.last_other_attendance(p_client_id) l
  where public.is_active_user();
$$;

-- Pesquisa na base inteira (dados resumidos)
create or replace function public.search_clients(p_query text, p_limit int default 30)
returns table (
  id uuid, name text, legal_name text, person_type text, document text, phone text, address text, contact_person text,
  origin_name text, origin_store text, is_mine boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.norm_text(trim(coalesce(p_query, '')));
  qd text := public.only_digits(p_query);
begin
  if not public.is_active_user() or length(q) < 2 then return; end if;
  return query
    select c.id, c.name, c.legal_name, c.person_type, c.document, c.phone, c.address, c.contact_person,
           public.person_name(c.user_id), public.store_name(c.store_id),
           (c.user_id = auth.uid() or public.has_activity_on_client(c.id))
    from public.clients c
    where c.deleted_at is null
      and (
        public.norm_text(c.name) like '%' || q || '%'
        or public.norm_text(c.legal_name) like '%' || q || '%'
        or public.norm_text(c.contact_person) like '%' || q || '%'
        or (qd is not null and length(qd) >= 3 and (c.document like '%' || qd || '%' or c.phone_digits like '%' || qd || '%'))
      )
    order by c.name
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

-- Cliente com o mesmo documento ou telefone (antes de cadastrar)
create or replace function public.check_client_duplicates(p_document text, p_phone text, p_exclude uuid default null)
returns table (id uuid, name text, match text, origin_name text, origin_store text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name,
         case when c.document is not null and c.document = public.only_digits(p_document) then 'document' else 'phone' end,
         public.person_name(c.user_id), public.store_name(c.store_id)
  from public.clients c
  where public.is_active_user()
    and c.deleted_at is null
    and (p_exclude is null or c.id <> p_exclude)
    and (
      (public.only_digits(p_document) is not null and c.document = public.only_digits(p_document))
      or (length(coalesce(public.only_digits(p_phone), '')) >= 8 and c.phone_digits = public.only_digits(p_phone))
    )
  order by 3, c.name
  limit 5;
$$;

-- Ficha do cliente: resumo para todos; dados completos (observações, email) para quem cadastrou e admin
create or replace function public.client_card(p_client_id uuid)
returns table (
  id uuid, name text, legal_name text, person_type text, document text, phone text, address text, contact_person text,
  email text, notes text, user_id uuid, store_id uuid, origin_name text, origin_store text, can_edit boolean, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.legal_name, c.person_type, c.document, c.phone, c.address, c.contact_person,
         case when x.full then c.email end, case when x.full then c.notes end,
         c.user_id, c.store_id, public.person_name(c.user_id), public.store_name(c.store_id), x.full, c.created_at
  from public.clients c
  cross join lateral (select (public.is_admin() or c.user_id = auth.uid()) as full) x
  where c.id = p_client_id and c.deleted_at is null and public.is_active_user();
$$;

-- ---------------------------------------------------------------------
-- 5. Alertas de atendimento (só administradores veem)
-- ---------------------------------------------------------------------
create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  record_type text not null check (record_type in ('interaction', 'sale')),
  record_id uuid not null,
  user_id uuid not null,           -- quem registrou mesmo com o aviso
  other_user_id uuid,              -- quem já atendia
  other_last_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  seen_by uuid,
  seen_at timestamptz
);
create index if not exists attendance_alerts_open_idx on public.attendance_alerts(seen_at, created_at desc);
alter table public.attendance_alerts enable row level security;
revoke all on public.attendance_alerts from public, anon, authenticated;
grant select on public.attendance_alerts to authenticated;
grant all on public.attendance_alerts to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'attendance_alerts' and policyname = 'attendance_alerts_select') then
    create policy attendance_alerts_select on public.attendance_alerts for select to authenticated using (public.is_admin());
  end if;
end $$;

-- O próprio banco detecta o conflito (mesmo que alguém pule o aviso da tela)
create or replace function public.detect_attendance_conflict()
returns trigger language plpgsql security definer set search_path = public as $$
declare l record; v_client text; v_kind text; v_days int;
begin
  if tg_table_name = 'sales' then
    if (to_jsonb(new) ->> 'settles_sale_id') is not null then
      return new; -- quitação não é novo atendimento
    end if;
  end if;
  if exists (select 1 from public.profiles where id = new.user_id and role = 'admin') then
    return new; -- ações do administrador não geram alerta para ele mesmo
  end if;
  select * into l from public.last_other_attendance(new.client_id, new.user_id);
  if l.other_user_id is null then
    return new;
  end if;
  select name into v_client from public.clients where id = new.client_id;
  v_kind := case when tg_table_name = 'sales' then 'sale' else 'interaction' end;
  v_days := greatest(0, (now() at time zone 'America/Campo_Grande')::date - (l.last_at at time zone 'America/Campo_Grande')::date);
  insert into public.attendance_alerts (client_id, record_type, record_id, user_id, other_user_id, other_last_at, reason)
  values (new.client_id, v_kind, new.id, new.user_id, l.other_user_id, l.last_at, new.conflict_reason);
  perform public.log_activity('ALERTA_ATENDIMENTO', v_kind, new.id,
    public.person_name(new.user_id) || ' registrou ' || case when v_kind = 'sale' then 'venda' else 'contato' end ||
    ' no cliente "' || v_client || '", atendido por ' || l.other_name || ' (último contato há ' || v_days || ' dia(s))' ||
    coalesce(' — motivo: ' || new.conflict_reason, ' — sem motivo informado'),
    new.user_id);
  return new;
end;
$$;
-- nome com "zz" para rodar depois do gatilho do histórico (ordem alfabética)
drop trigger if exists interactions_zz_attendance on public.interactions;
create trigger interactions_zz_attendance after insert on public.interactions
  for each row execute function public.detect_attendance_conflict();
drop trigger if exists sales_zz_attendance on public.sales;
create trigger sales_zz_attendance after insert on public.sales
  for each row execute function public.detect_attendance_conflict();

create or replace function public.mark_alert_seen(p_alert_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores'; end if;
  update public.attendance_alerts set seen_at = now(), seen_by = auth.uid() where id = p_alert_id and seen_at is null;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Quitação de pendência (NF obrigatória)
-- ---------------------------------------------------------------------
create or replace function public.settle_pending_sale(p_sale_id uuid, p_payment_method text, p_nf_number text, p_nf_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.sales%rowtype; v_new uuid; v_client text; v_nf text := nullif(trim(coalesce(p_nf_number, '')), '');
begin
  if not public.is_active_user() then raise exception 'Seu acesso ainda não foi liberado'; end if;
  select * into s from public.sales where id = p_sale_id and deleted_at is null for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if not (public.is_admin() or s.user_id = auth.uid()) then raise exception 'Sem permissão para quitar esta pendência'; end if;
  if s.payment_method is distinct from 'pendencia' then raise exception 'Esta venda não é uma pendência'; end if;
  if s.settled_at is not null then raise exception 'Esta pendência já foi quitada'; end if;
  if p_payment_method is null or p_payment_method not in ('dinheiro', 'cartao', 'pix', 'deposito', 'boleto') then
    raise exception 'Escolha a forma de pagamento da quitação';
  end if;
  if v_nf is null then raise exception 'Informe o número da NF'; end if;
  if p_nf_date is null then raise exception 'Informe a data da NF'; end if;
  if p_nf_date > (now() at time zone 'America/Campo_Grande')::date then raise exception 'A data da NF não pode ser no futuro'; end if;

  insert into public.sales (user_id, client_id, sold_at, amount, description, payment_method, nf_number, nf_date,
                            settles_sale_id, post_sale_done_at)
  values (auth.uid(), s.client_id, (p_nf_date + time '12:00') at time zone 'America/Campo_Grande', s.amount,
          'Quitação da pendência de ' || to_char(s.sold_at at time zone 'America/Campo_Grande', 'DD/MM/YYYY') ||
          coalesce(' — ' || s.description, ''),
          p_payment_method, v_nf, p_nf_date, s.id, now())
  returning id into v_new;

  update public.sales set settled_at = now(), settled_by_sale_id = v_new where id = s.id;

  select name into v_client from public.clients where id = s.client_id;
  perform public.log_activity('QUITOU', 'sale', s.id,
    'Quitou a pendência de ' || public.fmt_brl(s.amount) || ' do cliente "' || v_client || '" — NF ' || v_nf ||
    ' de ' || to_char(p_nf_date, 'DD/MM/YYYY') || ', ' || public.payment_label(p_payment_method));
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Histórico: novos campos nas descrições
-- ---------------------------------------------------------------------
create or replace function public.audit_clients()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('CRIOU', 'client', new.id,
      'Cadastrou o cliente "' || new.name || '"' ||
      coalesce(' (' || case when new.person_type = 'pj' then 'CNPJ ' else 'CPF ' end || new.document || ')', '') ||
      ' — loja ' || public.store_name(new.store_id) || ', vendedor ' || public.person_name(new.user_id));
    return new;
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    return new;
  end if;
  v := array_to_string(array[
    public.audit_diff('nome', old.name, new.name),
    public.audit_diff('razão social', old.legal_name, new.legal_name),
    public.audit_diff('tipo', case old.person_type when 'pj' then 'empresa' else 'pessoa física' end,
                              case new.person_type when 'pj' then 'empresa' else 'pessoa física' end),
    public.audit_diff('documento', old.document, new.document),
    public.audit_diff('pessoa de contato', old.contact_person, new.contact_person),
    public.audit_diff('telefone', old.phone, new.phone),
    public.audit_diff('email', old.email, new.email),
    public.audit_diff('endereço', old.address, new.address),
    case when old.notes is distinct from new.notes then 'observações alteradas' end,
    case when old.user_id is distinct from new.user_id
      then public.audit_diff('vendedor de origem', public.person_name(old.user_id), public.person_name(new.user_id)) end,
    case when old.store_id is distinct from new.store_id
      then public.audit_diff('loja', public.store_name(old.store_id), public.store_name(new.store_id)) end
  ], '; ');
  if v <> '' then
    perform public.log_activity('EDITOU', 'client', new.id, 'Editou o cliente "' || new.name || '": ' || v);
  end if;
  return new;
end;
$$;

create or replace function public.audit_sales()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text; v_client text;
begin
  select name into v_client from public.clients where id = new.client_id;
  if tg_op = 'INSERT' then
    perform public.log_activity('CRIOU', 'sale', new.id,
      case when new.settles_sale_id is not null then 'Registrou a quitação de ' else 'Registrou venda de ' end ||
      public.fmt_brl(new.amount) || ' (' || public.payment_label(new.payment_method) || ')' ||
      coalesce(' NF ' || new.nf_number, '') || ' no cliente "' || v_client || '"' ||
      case when new.settles_sale_id is not null then ''
        else ' — pós-venda em ' || public.fmt_dt(new.post_sale_due_at) ||
             case when new.post_sale_manual then ' (data escolhida)' else ' (automático, 3 dias)' end end);
    return new;
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    return new;
  end if;
  if old.settled_at is null and new.settled_at is not null then
    return new; -- quitação é registrada por settle_pending_sale
  end if;
  v := array_to_string(array[
    case when old.sold_at is distinct from new.sold_at
      then public.audit_diff('data da venda', public.fmt_dt(old.sold_at), public.fmt_dt(new.sold_at)) end,
    case when old.amount is distinct from new.amount
      then public.audit_diff('valor', public.fmt_brl(old.amount), public.fmt_brl(new.amount)) end,
    case when old.payment_method is distinct from new.payment_method
      then public.audit_diff('forma de pagamento', public.payment_label(old.payment_method), public.payment_label(new.payment_method)) end,
    public.audit_diff('NF', old.nf_number, new.nf_number),
    case when old.nf_date is distinct from new.nf_date
      then public.audit_diff('data da NF', to_char(old.nf_date, 'DD/MM/YYYY'), to_char(new.nf_date, 'DD/MM/YYYY')) end,
    case when old.description is distinct from new.description then 'descrição alterada' end,
    case when old.post_sale_due_at is distinct from new.post_sale_due_at
      then public.audit_diff('data do pós-venda', public.fmt_dt(old.post_sale_due_at), public.fmt_dt(new.post_sale_due_at)) end,
    case when old.post_sale_manual is distinct from new.post_sale_manual
      then case when new.post_sale_manual then 'pós-venda com data escolhida manualmente' else 'pós-venda voltou ao automático (3 dias)' end end,
    case when old.post_sale_done_at is distinct from new.post_sale_done_at
      then case when new.post_sale_done_at is not null then 'pós-venda concluído' else 'pós-venda reaberto' end end
  ], '; ');
  if v <> '' then
    perform public.log_activity('EDITOU', 'sale', new.id, 'Editou a venda do cliente "' || v_client || '": ' || v);
  end if;
  return new;
end;
$$;

-- Correção: visita sem retorno agendado não deve dizer "retorno agendado para (sem data)"
create or replace function public.audit_interactions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text; v_client text;
begin
  select name into v_client from public.clients where id = new.client_id;
  if tg_op = 'INSERT' then
    perform public.log_activity('CRIOU', 'interaction', new.id,
      'Registrou ' || public.interaction_type_label(new.type) || ' em ' || public.fmt_dt(new.happened_at) ||
      ' no cliente "' || v_client || '"' ||
      case when new.follow_up_at is not null then ' — retorno agendado para ' || public.fmt_dt(new.follow_up_at) else '' end);
    return new;
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    return new;
  end if;
  v := array_to_string(array[
    public.audit_diff('tipo', public.interaction_type_label(old.type), public.interaction_type_label(new.type)),
    case when old.happened_at is distinct from new.happened_at
      then public.audit_diff('data', public.fmt_dt(old.happened_at), public.fmt_dt(new.happened_at)) end,
    public.audit_diff('com quem falou', old.contact_person, new.contact_person),
    case when old.notes is distinct from new.notes then 'anotações alteradas' end,
    case when old.follow_up_at is distinct from new.follow_up_at
      then public.audit_diff('retorno agendado',
        case when old.follow_up_at is null then '' else public.fmt_dt(old.follow_up_at) end,
        case when new.follow_up_at is null then '' else public.fmt_dt(new.follow_up_at) end) end,
    case when old.follow_up_done is distinct from new.follow_up_done
      then case when new.follow_up_done then 'retorno marcado como feito' else 'retorno reaberto' end end
  ], '; ');
  if v <> '' then
    perform public.log_activity('EDITOU', 'interaction', new.id,
      'Editou a ' || public.interaction_type_label(new.type) || ' do cliente "' || v_client || '": ' || v);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Exclusão: cliente só por quem cadastrou (ou admin); visita/venda só pelo autor (ou admin)
-- ---------------------------------------------------------------------
create or replace function public.request_deletion(p_entity_type text, p_entity_id uuid, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_owner uuid;
  v_label text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_active_user() then
    raise exception 'Seu acesso ainda não foi liberado';
  end if;
  if p_entity_type = 'client' then
    select id, user_id into v_client, v_owner from public.clients where id = p_entity_id and deleted_at is null;
  elsif p_entity_type = 'interaction' then
    select client_id, user_id into v_client, v_owner from public.interactions where id = p_entity_id and deleted_at is null;
  elsif p_entity_type = 'sale' then
    select client_id, user_id into v_client, v_owner from public.sales where id = p_entity_id and deleted_at is null;
  else
    raise exception 'Tipo de registro inválido';
  end if;
  if v_client is null or not (public.is_admin() or v_owner = auth.uid()) then
    raise exception 'Registro não encontrado ou sem permissão';
  end if;

  v_label := public.entity_label(p_entity_type, p_entity_id);

  if public.is_admin() then
    update public.deletion_requests
       set status = 'approved', decided_by = auth.uid(), decided_at = now(),
           decision_note = 'Excluído diretamente pelo administrador'
     where entity_type = p_entity_type and entity_id = p_entity_id and status = 'pending';
    insert into public.deletion_requests
      (entity_type, entity_id, client_id, entity_label, reason, status, requested_by, decided_by, decided_at, decision_note)
    values (p_entity_type, p_entity_id, v_client, v_label, v_reason, 'approved', auth.uid(), auth.uid(), now(), 'Exclusão direta do administrador');
    perform public.soft_delete_record(p_entity_type, p_entity_id);
    perform public.log_activity('EXCLUIU', p_entity_type, p_entity_id,
      'Excluiu — ' || v_label || coalesce(' — motivo: ' || v_reason, ''));
    return 'deleted';
  end if;

  if exists (select 1 from public.deletion_requests where entity_type = p_entity_type and entity_id = p_entity_id and status = 'pending') then
    raise exception 'Já existe uma solicitação de exclusão pendente para este registro';
  end if;

  insert into public.deletion_requests (entity_type, entity_id, client_id, entity_label, reason, requested_by)
  values (p_entity_type, p_entity_id, v_client, v_label, v_reason, auth.uid());
  perform public.log_activity('SOLICITOU_EXCLUSAO', p_entity_type, p_entity_id,
    'Solicitou a exclusão — ' || v_label || coalesce(' — motivo: ' || v_reason, ''));
  return 'requested';
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Permissões das funções
-- ---------------------------------------------------------------------
revoke all on function public.can_use_client(uuid) from public, anon;
revoke all on function public.has_activity_on_client(uuid) from public, anon;
revoke all on function public.last_other_attendance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.client_attendance_check(uuid) from public, anon;
revoke all on function public.search_clients(text, int) from public, anon;
revoke all on function public.check_client_duplicates(text, text, uuid) from public, anon;
revoke all on function public.client_card(uuid) from public, anon;
revoke all on function public.mark_alert_seen(uuid) from public, anon;
revoke all on function public.settle_pending_sale(uuid, text, text, date) from public, anon;
revoke all on function public.detect_attendance_conflict() from public, anon, authenticated;
revoke all on function public.activity_set_store() from public, anon, authenticated;
revoke all on function public.clients_validate() from public, anon, authenticated;
grant execute on function public.can_use_client(uuid), public.has_activity_on_client(uuid) to authenticated;
grant execute on function public.client_attendance_check(uuid) to authenticated;
grant execute on function public.search_clients(text, int) to authenticated;
grant execute on function public.check_client_duplicates(text, text, uuid) to authenticated;
grant execute on function public.client_card(uuid) to authenticated;
grant execute on function public.mark_alert_seen(uuid) to authenticated;
grant execute on function public.settle_pending_sale(uuid, text, text, date) to authenticated;
