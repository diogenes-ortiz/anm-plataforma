-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Fase 1: seguridad (login con Google + permisos en la base)
-- Correr en Supabase → SQL Editor → New query → pegar todo → Run.
-- PASO A de 2. No cambia nada para la versión actual de la plataforma: solo crea
-- la lista de Gmails autorizados. Se puede correr ya.
-- ANTES: correr fase0-historial.sql y descargar un respaldo (Ajustes y Finanzas → ⚙).
-- ANTES DE CORRER: reemplazar TU_MAIL@gmail.com (abajo, punto 1) por tu Gmail.
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

-- Verificación: tiene que mostrar tu mail como 'owner'
select * from public.anm_access;
