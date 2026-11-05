# Fase 1 · Pasos para activar el login con Google

Se hacen una sola vez. Llevan unos 20 minutos y todo es gratis (Google Cloud y Supabase no cobran por esto).
Hasta que no estén todos hechos, **no se mergea** el pull request de la Fase 1: la plataforma actual sigue funcionando igual.

## 0. Antes de empezar
1. Descargá un respaldo: plataforma (Ajustes → "Descargar respaldo") y Finanzas (⚙ → "Descargar backup").
2. Confirmá que en Crecimiento están los 50 prospectos de la lista Hunter. El archivo con esa lista se borra en esta fase, así que si nunca se importaron, importalos antes desde la versión actual.
3. Corré `supabase/fase0-historial.sql` (Fase 0) si todavía no lo hiciste.

## 1. Google Cloud: crear el "botón" de Google (gratis)
1. Entrá a https://console.cloud.google.com con tu Gmail → creá un proyecto llamado "ANM Plataforma".
2. **APIs y servicios → Pantalla de consentimiento de OAuth**: tipo "Externo"; nombre de la app "ANM Plataforma"; tu mail como soporte y contacto. Guardá. En "Público", tocá **Publicar app**. Así cualquier Gmail puede iniciar sesión, pero solo entra a la plataforma quien vos autorices.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: **Aplicación web**.
   - Orígenes de JavaScript autorizados: `https://diogenes-ortiz.github.io`
   - URI de redireccionamiento autorizados: `https://pxsgqbldbdvbrfwqnvyl.supabase.co/auth/v1/callback`
4. Copiá el **ID de cliente** y el **Secreto del cliente**.

## 2. Supabase: activar Google
1. Supabase → **Authentication → Sign In / Providers → Google** → activalo y pegá el ID y el secreto del paso 1 → Save.
2. **Authentication → URL Configuration**:
   - Site URL: `https://diogenes-ortiz.github.io/anm-plataforma/`
   - Redirect URLs: agregá `https://diogenes-ortiz.github.io/anm-plataforma/**`
3. Repetí 1 y 2 en el proyecto de prueba (con su propia URL de callback en Google: `https://<proyecto-de-prueba>.supabase.co/auth/v1/callback`).

## 3. Supabase: permisos
1. Abrí `supabase/fase1-seguridad.sql`, reemplazá `TU_MAIL@gmail.com` por **tu** Gmail (el que vas a usar para entrar).
2. **Primero en el proyecto de prueba**: SQL Editor → pegar todo → Run. Al final tiene que mostrar tu mail como `owner`.
3. Probá la versión nueva en `/staging/` o con `?entorno=prueba`: entrá con Google, autorizá un segundo Gmail en Equipo → Accesos, y entrá con ese.
4. Cuando confirmes que anda: mergear el PR y, en el mismo momento, correr el SQL en **producción**.

> Desde que corrés el SQL en producción, la versión vieja deja de poder leer datos. Por eso se hace junto con el merge. Para volver atrás, al final del archivo está el bloque "DESHACER".

## 4. Apps Script (recordatorios y respaldo)
En el proyecto de Apps Script → ⚙ Configuración del proyecto → Propiedades de la secuencia de comandos → agregar:
- `SUPABASE_SERVICE_KEY` = la clave **secret** de Supabase (Project Settings → API Keys). Esta clave nunca va en el código.

Después, pegá las versiones nuevas de `apps-script/Recordatorios.gs` y `apps-script/Respaldo.gs`, y probá `probarConmigo` y `respaldarAhora`.

El archivo `IA.gs` se eliminó (la IA automática era paga). Si lo tenías instalado, borralo del proyecto de Apps Script y quitá las propiedades `ANTHROPIC_API_KEY` y `CLAVE_ANM`.

## 5. Primer ingreso de cada persona
1. Entrá vos con Google. Si tu nombre de Google coincide con tu perfil, se vincula solo; si no, elegís cuál perfil sos.
2. En **Equipo → Accesos → Autorizar un Gmail** cargá el Gmail de cada persona y su rol (Socio, Equipo o Invitado). Opcional: elegí su perfil para vincularlo.
3. Cada persona entra con "Entrar con Google". Las contraseñas viejas dejan de existir.

## 6. Cambiar claves (SEG-10), al final
Las claves viejas estuvieron públicas en el código, así que conviene cambiarlas una vez que todo funcione:
1. **Supabase → Project Settings → API Keys**: creá una nueva clave *publishable*, reemplazala en `js/config.js` (te lo hago yo en un PR) y después desactivá la vieja.
2. Creá una nueva clave *secret*, actualizá `SUPABASE_SERVICE_KEY` en Apps Script y desactivá la vieja.
3. Si alguna vez creaste una clave de la API de Claude (console.anthropic.com), borrala.
4. La contraseña de Finanzas: cambiala desde Finanzas → ⚙ → "Cambiar contraseña de Finanzas".

## Qué queda para más adelante
- **SEG-13 (permisos por cliente para invitados)**: requiere pasar los datos a tablas (Fase 3, DATOS-01). Hoy el invitado ve toda Operaciones, pero no Crecimiento ni Finanzas.
- **Historial de git**: las minutas y la lista de prospectos siguen en commits viejos del repositorio. Una vez mergeada esta fase, puedo reescribir el historial para borrarlos (requiere forzar `main`).
