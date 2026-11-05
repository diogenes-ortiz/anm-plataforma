-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Fase 1: seguridad (login con Google + permisos en la base)
-- Correr en Supabase → SQL Editor → New query → pegar todo → Run.
-- ANTES: correr fase0-historial.sql y descargar un respaldo (Ajustes y Finanzas → ⚙).
-- ANTES DE CORRER: reemplazar TU_MAIL@gmail.com (abajo, punto 1) por tu Gmail.
--
-- Después de correr esto la plataforma VIEJA deja de funcionar (ya no se puede
-- leer sin sesión): correrlo recién cuando se publica la versión nueva.
-- Para volver atrás: correr el bloque "DESHACER" del final.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Lista de Gmails autorizados. Solo el dueño la puede modificar.
create table if not exists public.anm_access (
  email     text primary key check (email = lower(email)),
  role      text not null check (role in ('owner','socio','equipo','invitado')),
  member_id text,
  added_at  timestamptz not null default now(),
  added_by  text default (auth.jwt() ->> 'email')
);
insert into public.anm_access (email, role) values (lower('TU_MAIL@gmail.com'), 'owner')
  on conflict (email) do update set role = 'owner';

-- Rol de quien hace el pedido (null si no está autorizado)
create or replace function public.anm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.anm_access where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

alter table public.anm_access enable row level security;
drop policy if exists "acceso ver"        on public.anm_access;
drop policy if exists "acceso dueño crea" on public.anm_access;
drop policy if exists "acceso dueño edita" on public.anm_access;
drop policy if exists "acceso dueño borra" on public.anm_access;
-- Cada uno ve su propia fila; el dueño ve todas
create policy "acceso ver" on public.anm_access for select to authenticated
  using (email = lower(auth.jwt() ->> 'email') or public.anm_role() = 'owner');
-- Solo el dueño agrega o cambia (y no puede crear otro dueño)
create policy "acceso dueño crea" on public.anm_access for insert to authenticated
  with check (public.anm_role() = 'owner' and role <> 'owner');
create policy "acceso dueño edita" on public.anm_access for update to authenticated
  using (public.anm_role() = 'owner' and role <> 'owner')
  with check (public.anm_role() = 'owner' and role <> 'owner');
-- Solo el dueño quita accesos (y nunca el suyo, para no quedar afuera)
create policy "acceso dueño borra" on public.anm_access for delete to authenticated
  using (public.anm_role() = 'owner' and role <> 'owner');
revoke all on public.anm_access from anon;
grant select, insert, update, delete on public.anm_access to authenticated;

-- 2) Datos: nada sin sesión. Finanzas ('main') solo dueño y socios.
--    Crecimiento ('growth') no lo ven los invitados.
create or replace function public.anm_puede(fila text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when fila = 'main'   then public.anm_role() in ('owner','socio')
    when fila = 'growth' then public.anm_role() in ('owner','socio','equipo')
    when fila in ('ops','team') then public.anm_role() is not null
    else false end;
$$;

drop policy if exists "anm leer"      on public.anm_state;
drop policy if exists "anm crear"     on public.anm_state;
drop policy if exists "anm modificar" on public.anm_state;
create policy "anm leer" on public.anm_state for select to authenticated using (public.anm_puede(id));
create policy "anm crear" on public.anm_state for insert to authenticated with check (public.anm_puede(id));
create policy "anm modificar" on public.anm_state for update to authenticated
  using (public.anm_puede(id)) with check (public.anm_puede(id));
revoke all on public.anm_state from anon;
grant select, insert, update on public.anm_state to authenticated;

-- 3) Errores: solo con sesión
drop policy if exists "anm errores insertar" on public.anm_errors;
create policy "anm errores insertar" on public.anm_errors for insert to authenticated
  with check (length(coalesce(msg,'')) < 2000);
revoke all on public.anm_errors from anon;
grant insert on public.anm_errors to authenticated;

-- 4) Limpieza de datos sensibles viejos (contraseñas, códigos de invitación, clave de IA).
--    La versión anterior queda en anm_state_history por si hace falta volver.
update public.anm_state set data = jsonb_set(data, '{members}',
  coalesce((select jsonb_agg(m - 'passHash' - 'passSalt' - 'invite') from jsonb_array_elements(data->'members') m), '[]'::jsonb))
where id = 'team' and data ? 'members';
update public.anm_state set data = jsonb_set(data, '{settings}',
  coalesce((select jsonb_agg(s) from jsonb_array_elements(data->'settings') s where s->>'id' not in ('aiToken','aiUrl')), '[]'::jsonb))
where id = 'team' and data ? 'settings';

-- Verificación: tiene que mostrar tu mail como 'owner'
select * from public.anm_access;

-- ═══ DESHACER (solo si hay que volver a la versión anterior de la plataforma) ═══
-- create policy "anm leer viejo" on public.anm_state for select to anon using (true);
-- create policy "anm crear viejo" on public.anm_state for insert to anon with check (id in ('main','ops','growth','team'));
-- create policy "anm modificar viejo" on public.anm_state for update to anon using (id in ('main','ops','growth','team')) with check (id in ('main','ops','growth','team'));
-- grant select, insert, update on public.anm_state to anon;
