-- ═══════════════════════════════════════════════════════════════════════════
-- ANM · Rol "Solo Ventas"
-- Permite autorizar Gmails con el rol 'ventas' (solo ven el área de Ventas).
-- Correr una vez en Supabase → SQL Editor → New query → pegar → Run.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.anm_access drop constraint if exists anm_access_role_check;
alter table public.anm_access add constraint anm_access_role_check
  check (role in ('owner','socio','equipo','invitado','ventas'));

-- Si ya corriste el PASO B (fase1b-cerrar-base.sql), esto actualiza los permisos de la base:
-- Ventas ve Ventas ('growth') y el equipo ('team'), pero no Operaciones ni Finanzas.
create or replace function public.anm_puede(fila text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when fila = 'main'   then public.anm_role() in ('owner','socio')
    when fila = 'growth' then public.anm_role() in ('owner','socio','equipo','ventas')
    when fila = 'ops'    then public.anm_role() in ('owner','socio','equipo','invitado')
    when fila = 'team'   then public.anm_role() is not null
    else false end;
$$;

select 'listo' as resultado;
