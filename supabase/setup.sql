-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Base de datos de la plataforma
-- Cómo usarlo: en tu proyecto de Supabase → SQL Editor → New query →
-- pegá TODO este archivo → Run. Se puede correr más de una vez sin problema.
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabla única: cada fila guarda una sección como documento JSON
--   main   = Finanzas
--   ops    = Operaciones (clientes, tareas, calendario, reuniones)
--   growth = Crecimiento / CRM (prospectos, contactos, mensajes)
--   team   = Equipo (personas, roles, actividad y XP, avisos, ajustes)
create table if not exists public.anm_state (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Filas iniciales vacías (la app las completa sola)
insert into public.anm_state (id, data) values
  ('main', '{}'::jsonb), ('ops', '{}'::jsonb), ('growth', '{}'::jsonb), ('team', '{}'::jsonb)
on conflict (id) do nothing;

-- Seguridad a nivel de fila: la app (clave pública) puede leer y guardar
-- estas cuatro filas, pero NO borrar filas ni crear otras.
alter table public.anm_state enable row level security;

drop policy if exists "anm leer"      on public.anm_state;
drop policy if exists "anm crear"     on public.anm_state;
drop policy if exists "anm modificar" on public.anm_state;

create policy "anm leer" on public.anm_state
  for select to anon, authenticated using (true);

create policy "anm crear" on public.anm_state
  for insert to anon, authenticated
  with check (id in ('main','ops','growth','team'));

create policy "anm modificar" on public.anm_state
  for update to anon, authenticated
  using (id in ('main','ops','growth','team'))
  with check (id in ('main','ops','growth','team'));

grant select, insert, update on public.anm_state to anon, authenticated;

-- Verificación: tiene que mostrar las 4 filas
select id, updated_at from public.anm_state order by id;
