-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Fase 1 · PASO B de 2: cerrar la base (nada sin sesión de Google)
-- Correr SOLO cuando:  1) la versión nueva ya está publicada,  2) vos entraste con
-- Google y autorizaste los Gmails del equipo en Equipo → Accesos,  3) cada persona
-- ya entró al menos una vez. Desde este momento, sin sesión no se lee nada.
-- Para volver atrás: correr el bloque "DESHACER" del final.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══ DESHACER (solo si hay que volver a la versión anterior de la plataforma) ═══
-- create policy "anm leer viejo" on public.anm_state for select to anon using (true);
-- create policy "anm crear viejo" on public.anm_state for insert to anon with check (id in ('main','ops','growth','team'));
-- create policy "anm modificar viejo" on public.anm_state for update to anon using (id in ('main','ops','growth','team')) with check (id in ('main','ops','growth','team'));
-- grant select, insert, update on public.anm_state to anon;
