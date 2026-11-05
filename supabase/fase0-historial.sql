-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Fase 0: historial de versiones y registro de errores
-- Correr UNA vez en Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede volver a correr sin problema (no borra nada).
-- Correrlo en producción Y en el proyecto de prueba.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Historial: antes de cada cambio en anm_state se guarda la versión anterior.
--    Si una escritura rompe algo, se puede volver atrás (ver punto 3).
create table if not exists public.anm_state_history (
  hid        bigint generated always as identity primary key,
  id         text        not null,              -- 'main', 'ops', 'growth' o 'team'
  data       jsonb       not null,              -- cómo estaba ANTES del cambio
  changed_at timestamptz not null default now(),
  changed_by text                                -- quién (cuando haya login)
);
create index if not exists anm_state_history_id_at on public.anm_state_history (id, changed_at desc);
alter table public.anm_state_history enable row level security;   -- nadie lo lee desde la app

create or replace function public.anm_guardar_historial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.data is distinct from new.data then
    insert into public.anm_state_history (id, data, changed_by)
    values (old.id, old.data, coalesce(auth.jwt() ->> 'email', 'anon'));
  end if;
  return new;
end $$;

drop trigger if exists anm_state_historial on public.anm_state;
create trigger anm_state_historial before update on public.anm_state
  for each row execute function public.anm_guardar_historial();

-- Retención: se conservan 90 días (y siempre al menos las últimas 50 versiones de cada fila)
create or replace function public.anm_limpiar_historial() returns void
language sql security definer set search_path = public as $$
  delete from public.anm_state_history h
  where h.changed_at < now() - interval '90 days'
    and h.hid not in (select hid from (
      select hid, row_number() over (partition by id order by changed_at desc) n from public.anm_state_history) x where n <= 50);
$$;

-- 2) Registro de errores de la app (se escribe solo; no se puede leer desde la app)
create table if not exists public.anm_errors (
  eid     bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  msg     text,
  page    text,
  version text,
  who     text,
  agent   text
);
alter table public.anm_errors enable row level security;
drop policy if exists "anm errores insertar" on public.anm_errors;
create policy "anm errores insertar" on public.anm_errors for insert to anon, authenticated
  with check (length(coalesce(msg,'')) < 2000);
grant insert on public.anm_errors to anon, authenticated;

-- 3) Cómo volver atrás (copiar y correr a mano, cambiando lo que corresponda):
--    a) Ver las últimas versiones de una fila:
--         select hid, changed_at, changed_by from anm_state_history where id = 'ops' order by changed_at desc limit 20;
--    b) Restaurar una versión puntual (el estado actual queda a su vez en el historial):
--         update anm_state set data = (select data from anm_state_history where hid = 123), updated_at = now() where id = 'ops';
--    c) Ver los últimos errores de la app:
--         select * from anm_errors order by at desc limit 50;
