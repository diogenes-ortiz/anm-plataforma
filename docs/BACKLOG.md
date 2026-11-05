# ANM Plataforma: backlog completo de mejoras

Repositorio: `diogenes-ortiz/anm-plataforma`
Revisado sobre el commit `d010b7e` (6 de octubre de 2026). Los números de línea corresponden a ese commit: confirmar antes de editar.

## Instrucciones para Claude Code

1. Leer este archivo y `README.md` completos antes de tocar código. Guardar este archivo como `docs/BACKLOG.md`.
2. No implementar todo de una vez. Trabajar por fases, en orden, con una rama y un pull request por fase. No publicar en `main` sin aprobación de Diogenes.
3. Antes de la primera modificación, presentar un plan de la Fase 0 y la Fase 1 y esperar aprobación.
4. Antes de cualquier migración de datos, descargar un respaldo y probar la restauración. Ninguna migración puede borrar el dato original hasta que Diogenes confirme que la nueva versión funciona.
5. Marcar cada ítem terminado con `[x]` y anotar en el pull request cómo se probó.
6. Si un ítem ya está resuelto o se contradice con el código, avisar y seguir; no rehacerlo.
7. Las decisiones de la sección "Decisiones de Diogenes" se preguntan; no se asumen.
8. Mantener el stack actual (HTML, CSS y JavaScript sin compilar, Supabase, GitHub Pages) salvo que un ítem indique lo contrario.
9. Correr `sh tools/bump-version.sh` antes de cada commit que toque `css/` o `js/`.

### Regla de producto

El problema principal es que la app cuesta sostenerla en el uso diario. Cada función nueva debe cumplir esto:

- No agrega campos obligatorios. Crear una tarea exige solo el título.
- Queda oculta hasta que se la pide (sección plegable, botón "más opciones" o ajuste).
- No suma elementos permanentes a la pantalla de Inicio.
- Tiene un valor por defecto razonable y funciona en el celular.
- Si dos funciones hacen lo mismo, se elimina una.

### Referencias

- **Prioridad:** P0 urgente, P1 alta, P2 media, P3 opcional.
- **[Confirmado]:** comprobado leyendo el código. **[Revisar]:** indicio que hay que investigar.
- **Ref:** herramienta que inspira la función. Se toma la idea, no su complejidad.

### Ya existe: no rehacer

Tablero y lista de tareas; selección múltiple; calendario mensual; entregables por cliente (calendario y reporte); seguimiento por cliente con semáforo; reuniones con minuta, decisiones, temáticas y acuerdos; conversión de acuerdos en tareas con `@Nombre` y `dd/mm`; "Ordenar reunión" con Claude; status para el cliente; alertas calculadas y descartables; recordatorios por mail con Apps Script; CRM con pipeline, plantillas y métricas; roles; respaldo manual; Finanzas. El modo oscuro existe, pero se elimina (ver Fase 5A).

---

## Fase 0. Red de seguridad antes de cambiar nada

- [ ] **BASE-01 · P0** Crear un entorno de prueba: segundo proyecto de Supabase y una forma de apuntar a él sin tocar producción. Acepta: se puede probar cualquier cambio sin afectar los datos reales. — pendiente: crear el segundo proyecto de Supabase y completar `prueba` en `js/config.js`.
- [x] **BASE-02 · P0** Configurar `js/config.js` por entorno, sin riesgo de publicar la configuración de prueba. — hecho: `js/config.js` con entornos `produccion`/`prueba` (`?entorno=prueba`), copia local separada y franja amarilla.
- [x] **BASE-03 · P0** Respaldo automático diario de `anm_state` (las cuatro filas) fuera de Supabase, con retención de 30 días. Acepta: se restauró un respaldo real en el entorno de prueba. — hecho: `apps-script/Respaldo.gs` (Drive, 30 días). Falta: instalarlo y probar una restauración en el entorno de prueba.
- [x] **BASE-04 · P0** Historial de versiones por documento: un trigger guarda la versión anterior antes de cada cambio. Hoy una sola escritura incorrecta puede destruir todo. — hecho: `supabase/fase0-historial.sql` (trigger + retención de 90 días). Falta: correrlo en Supabase.
- [x] **BASE-05 · P0** Pruebas de humo con Playwright: login, crear tarea, moverla, crear reunión, convertir acuerdo en tarea, abrir Finanzas. — hecho: `tests/smoke.spec.js` (4 pruebas, base simulada). `npm test`.
- [x] **BASE-06 · P1** Integración continua con GitHub Actions: pruebas en cada pull request y verificación de sintaxis. — hecho: `.github/workflows/ci.yml`.
- [x] **BASE-07 · P1** Publicación desde una rama de staging antes de pasar a `main`. — hecho: `.github/workflows/pages.yml` publica `staging` en `/staging/` con la base de prueba. Falta: Settings → Pages → Source: GitHub Actions.
- [x] **BASE-08 · P1** Automatizar `tools/bump-version.sh` en un hook o en la integración continua, para no depender de recordarlo. — hecho: hook `tools/hooks/pre-commit` (`sh tools/instalar-hooks.sh`) y control en la integración continua.
- [x] **BASE-09 · P2** Registrar errores de la app en una tabla o servicio; hoy solo se ven en pantalla (`showCrash` en `js/app.js`). — hecho: tabla `anm_errors` y `Store.logError`.

---

## Fase 1. Seguridad [urgente]

Hoy la protección ocurre solo en el navegador. Con la URL y la clave pública, ambas presentes en el código, se pueden leer y sobrescribir las cuatro filas. No avanzar con el portal de clientes ni con adjuntos hasta cerrar esta fase.

### Exposición de datos

- [ ] **SEG-01 · P0 [Confirmado]** `supabase/setup.sql:31-41` permite a `anon` leer y modificar todo `anm_state`, incluida la fila `main` de Finanzas. Reemplazar por políticas que exijan usuario autenticado y rol.
- [ ] **SEG-02 · P0 [Confirmado]** Implementar Supabase Auth. `js/app.js` compara el hash en el navegador y la identidad es solo `localStorage.anm_me`. Acepta: no se puede leer ni escribir nada sin sesión válida, aunque se edite `localStorage`.
- [ ] **SEG-03 · P0 [Confirmado]** Finanzas solo para socios desde la base de datos, no solo ocultando el menú. Hoy `Store.readFinance` y `js/fin.js:37` leen `main` con la clave pública. Acepta: una consulta como rol Equipo a `main` devuelve vacío.
- [ ] **SEG-04 · P0 [Confirmado]** Sacar del documento `team` todo lo sensible: `passHash`, `passSalt` e `invite` hoy son legibles con la clave pública. El hash es SHA-256 rápido.
- [ ] **SEG-05 · P0 [Confirmado]** Sacar `aiToken` de `team.settings` (`js/reunion.js:78,122`). Quien lo lea puede usar el puente de `apps-script/IA.gs` y consumir la API de Claude con cargo a ANM.
- [ ] **SEG-06 · P0 [Confirmado]** `apps-script/IA.gs:34` deja el puente abierto si falta `CLAVE_ANM`. Rechazar siempre si la clave no está configurada. Mover la llamada a una Edge Function con usuario autenticado.
- [ ] **SEG-07 · P0 [Confirmado]** `js/minutas.js` publica minutas de clientes en un archivo servido por GitHub Pages. Trasladarlas a la base de datos y eliminar el archivo. Preguntar antes de reescribir el historial de git.
- [ ] **SEG-08 · P0 [Confirmado]** `js/prospects-hunter.js` publica prospectos con datos de contacto y oportunidades detectadas. Trasladar a la base de datos con la misma salvedad.
- [ ] **SEG-09 · P1** Sacar `js/equipo-inicial.js`: expone nombres y roles del equipo. Usarlo una sola vez y eliminarlo.
- [ ] **SEG-10 · P0** Después de cerrar lo anterior: rotar claves de Supabase y `CLAVE_ANM`, revisar la clave de la API de Claude y pedir a todos una contraseña nueva. Dar a Diogenes una lista de pasos manuales.
- [ ] **SEG-11 · P1** Recordatorios: `apps-script/Recordatorios.gs` usa la clave pública para leer. Pasarlo a una Edge Function programada o a una credencial de servidor guardada en propiedades del script.

### Permisos

- [ ] **SEG-12 · P1** Aplicar los roles en el servidor. Hoy "Equipo" e "Invitado" son solo reglas de interfaz (`App.canGrowth`, `App.assignOpts`).
- [ ] **SEG-13 · P1** Permisos por cliente: un invitado ve solo sus cuentas. Hoy un freelancer ve toda la operación.
- [ ] **SEG-14 · P1 [Confirmado]** Unificar permisos sobre tareas: `Ops.bulk` limita las ajenas, pero `Ops.editTask` no. Definir la regla (ver decisiones).
- [ ] **SEG-15 · P2** Registro de auditoría: quién cambió qué y cuándo.

### Inyección de código

- [ ] **SEG-16 · P1 [Confirmado]** Validar enlaces: `href="${esc(t.link)}"` acepta `javascript:`. Crear `UI.safeUrl()` que permita solo `http`, `https`, `mailto` y `tel`, y aplicarla en todos los campos `link`, `pptLink`, `web` y `linkedin`.
- [ ] **SEG-17 · P1 [Confirmado]** Valores sin escapar: `m.color` en `js/ui.js:40`, `u.color` en `js/app.js:36`, `a.link` en `js/ops.js:527` e ids dentro de `onclick`. Validar colores con una expresión regular e ids con una lista de caracteres permitidos.
- [ ] **SEG-18 · P2** Reemplazar los `onclick` en línea por delegación de eventos y agregar una política CSP.
- [ ] **SEG-19 · P2** Código de invitación con `crypto.getRandomValues` y vencimiento. Hoy usa `Math.random` y no vence (`js/app.js:115`).
- [ ] **SEG-20 · P2** Limitar intentos de login y cerrar sesiones inactivas. Hoy la sesión no vence.

---

## Fase 2. Errores que hoy afectan el uso

### Se pierden o alteran datos

- [ ] **BUG-01 · P0 [Confirmado]** Editar una tarea ajena reasigna sin aviso. Un usuario de rol Equipo solo tiene su nombre en el selector (`js/app.js:35`, `js/ops.js:597`); al guardar, la tarea pasa a ser suya. Acepta: la persona actual se conserva como opción.
- [ ] **BUG-02 · P0 [Confirmado]** Editar una tarea de un cliente dado de baja la convierte en interna, porque `clientOpts` solo lista activos (`js/ops.js:531`). Conservar el cliente actual como opción. Revisar el mismo caso en contenido y reuniones.
- [ ] **BUG-03 · P0 [Confirmado]** `Store.upsert` pisa `createdAt` en cada actualización parcial (`js/store.js:141-144`); se reprodujo en una prueba. Afecta "Alta", "Ciclo de venta" (`js/growth.js:202`) y las alertas que usan `createdAt`. Acepta: se conserva la fecha original. Evaluar si se puede reconstruir la fecha perdida desde `interactions`.
- [ ] **BUG-04 · P0 [Confirmado]** Escape o un clic fuera del formulario lo cierran sin avisar y se pierde lo escrito (`js/ui.js:93-94`). Pedir confirmación si hubo cambios y guardar borrador de minutas y formularios largos.
- [ ] **BUG-05 · P1 [Confirmado]** Cerrar la pestaña dentro de los 900 ms siguientes a un cambio puede perderlo: `beforeunload` lanza un `flush` asíncrono (`js/store.js:128`). Usar `fetch` con `keepalive` o avisar de que hay cambios sin guardar.
- [ ] **BUG-06 · P1 [Confirmado]** Dos personas pueden pisarse: la secuencia leer, fusionar y escribir no es atómica (`js/store.js:80-88`). Se resuelve de raíz con DATOS-01; mientras tanto, comparar `updated_at` antes de escribir y reintentar.
- [ ] **BUG-07 · P1 [Confirmado]** Gana el registro más nuevo completo: si una persona cambia la fecha y otra el estado, se pierde un cambio (`js/store.js:37`). Fusionar por campo o resolverlo con DATOS-01.
- [ ] **BUG-08 · P1 [Confirmado]** La fusión depende del reloj de cada computadora. Usar la hora del servidor.
- [ ] **BUG-09 · P1 [Confirmado]** Los borrados pueden revivir: los registros eliminados se purgan a los 60 días (`js/store.js:39`) y una copia local más vieja los vuelve a subir.
- [ ] **BUG-10 · P1 [Confirmado]** `localStorage` lleno falla sin aviso (`js/store.js:78`). Avisar en pantalla.
- [ ] **BUG-11 · P1 [Revisar]** Hay tareas repetidas en la actividad del 5 de octubre ("Video / animación: cómo se coloca el sifón", "Propuesta para que los arquitectos..."). La causa probable es que al cargar un status o una minuta no se detectan las tareas ya cerradas (`js/ops.js:859`) y las minutas comunes no deduplican. Confirmar, corregir y ofrecer una limpieza revisada a mano.
- [ ] **BUG-12 · P2 [Confirmado]** `pendingMinutas` escribe en la base durante el dibujado de pantalla (`js/ops.js:106-108`). Separar lectura de escritura.
- [ ] **BUG-13 · P2** Borrar reuniones deja tareas con un `meetingId` huérfano. Definir qué pasa con ellas.
- [ ] **BUG-14 · P2** Quitar a una persona deja tareas con avatar "?". Pedir reasignación antes de quitarla.

### Fechas

- [ ] **BUG-15 · P1 [Confirmado]** Una tarea hecha después de las 21 h figura al día siguiente por usar la fecha UTC (`doneAt.slice(0,10)`, `js/game.js:25`); se reprodujo en una prueba. Baja el "% a tiempo" y mueve tareas de mes. Revisar todos los `.slice(0,10)` sobre fechas ISO (`updates.at`, `activity.at`).
- [ ] **BUG-16 · P2 [Confirmado]** `parseAction` no valida fechas: `31/02` genera una fecha imposible y un `05/01` escrito en diciembre queda en el pasado (`js/ops.js:501-502`). Pasar al año siguiente y rechazar fechas inválidas.
- [ ] **BUG-17 · P2 [Confirmado]** `Growth.viewToday` compara `x.at` en UTC con una fecha local. Unificar.

### Alertas

- [ ] **BUG-18 · P1 [Confirmado]** Las alertas de Crecimiento no se pueden descartar porque no tienen `key` (`js/growth.js:63-77`). En Inicio se ve que Nesgamet e Hidronorte no muestran la X.
- [ ] **BUG-19 · P1 [Confirmado]** "Ver todas" lleva a Operaciones, donde las alertas de Crecimiento no aparecen.
- [ ] **BUG-20 · P1 [Confirmado]** El filtro de unidad queda guardado en el navegador y oculta alertas y contadores en todas las pantallas (`js/ops.js:121`). Las alertas urgentes deben contarse siempre, o indicar claramente que hay un filtro activo.
- [ ] **BUG-21 · P1 [Confirmado]** Un cliente puede seguir como prospecto "enfriado": Hidronorte figura así en el CRM. Si existe un cliente activo con el mismo nombre, vincular el prospecto y no alertar. Ofrecer una conciliación entre `growth.leads` y `ops.clients`.

### Avisos

- [ ] **BUG-22 · P1 [Confirmado]** Reasignar una tarea o cambiar su fecha no avisa; solo se notifica al crearla (`js/ops.js:608`).
- [ ] **BUG-23 · P2 [Confirmado]** Los avisos se marcan como leídos todos juntos al abrir la campana, aunque no se hayan visto (`js/app.js:237`).
- [ ] **BUG-24 · P2 [Confirmado]** Las notificaciones crecen sin límite. Archivar las de más de 90 días.

### Listas e interfaz

- [ ] **BUG-25 · P1 [Confirmado]** El tablero no funciona en el celular: usa arrastre HTML5, que no responde al tacto (`js/ui.js:131-142`). Agregar arrastre táctil o un selector de estado en la tarjeta. Aplica también al pipeline.
- [ ] **BUG-26 · P2 [Confirmado]** Solo se ven las últimas 20 tareas hechas en el tablero y 15 en la lista (`js/ops.js:351,357`), y no hay forma de ver las anteriores. Agregar "Ver más". Revisar también los límites de 25 actualizaciones y 40 reuniones.
- [ ] **BUG-27 · P2 [Confirmado]** El texto de búsqueda se comparte entre pestañas (`js/ops.js:162`). Separarlo por pestaña.
- [ ] **BUG-28 · P2 [Confirmado]** Cada tecla redibuja toda la pantalla en las búsquedas (`Ops.setSearch`, `Growth.setQ`). Agregar una espera de 200 ms.
- [ ] **BUG-29 · P2 [Confirmado]** Redibujar con `innerHTML` pierde el desplazamiento interno de columnas y listas. Conservarlo.
- [ ] **BUG-30 · P2 [Confirmado]** La importación CSV separa mal los campos entre comillas (`js/growth.js:455`). Usar un parser real.
- [ ] **BUG-31 · P2 [Confirmado]** Reemplazar `confirm`, `prompt` y `alert` nativos por modales propios.
- [ ] **BUG-32 · P3 [Confirmado]** Error de texto: "Hay un status lista para cargar" (`js/home.js:32`).
- [ ] **BUG-33 · P3 [Confirmado]** La misión "Cerrar 10 tareas" muestra un tilde con 0/10 (`js/game.js:114`), y dos misiones aparecen cumplidas sin haber hecho nada.
- [ ] **BUG-34 · P3 [Confirmado]** Quedan textos de XP ("+8 XP", "Guardar (+8 XP)") aunque el nivel ya se calcula por tareas (`js/home.js:40`, `js/ops.js:576`). Eliminarlos o resolverlos según INI-05.
- [ ] **BUG-35 · P3 [Revisar]** `Store.flush` fusiona datos remotos sin avisar a la pantalla (`js/store.js:90-98`). Verificar si queda información vieja hasta el siguiente cambio.

---

## Fase 3. Datos y sincronización

- [ ] **DATOS-01 · P1** Migrar de un JSON por sección a tablas: `clients`, `tasks`, `meetings`, `content`, `updates`, `leads`, `interactions`, `members`, `notifications`, `activity`. Resuelve BUG-06, 07, 08 y 09 y habilita permisos reales. Hacerlo por etapas y con las dos fuentes en paralelo durante la transición.
- [ ] **DATOS-02 · P1** Script de migración que se pueda repetir sin duplicar y con conteos de verificación antes y después.
- [ ] **DATOS-03 · P1** Sincronización en tiempo real con Supabase Realtime, en lugar de bajar todo cada 20 segundos.
- [ ] **DATOS-04 · P2** Indicador claro de guardado: "Guardando", "Guardado", "Sin conexión, se guardará al volver".
- [ ] **DATOS-05 · P2** Modo sin conexión: cola de cambios pendientes que se envía al recuperar internet.
- [ ] **DATOS-06 · P2** Papelera de 30 días con opción de restaurar. Ya existe el borrado lógico; falta mostrarlo.
- [ ] **DATOS-07 · P2** "Deshacer" durante 8 segundos después de completar, mover o eliminar.
- [ ] **DATOS-08 · P2** Historial por tarea: quién cambió estado, fecha o responsable.
- [ ] **DATOS-09 · P2** Unificar los clientes de Operaciones y Finanzas con un mismo id. Hoy se relacionan por importación y nombre.
- [ ] **DATOS-10 · P3** Exportar todo a CSV y por cliente.
- [ ] **DATOS-11 · P3** Revisar `finanzas-completa.html` (146 KB) y `js/fin.js`: dos versiones de Finanzas para mantener. Proponer una.

---

## Fase 4. Carga rápida [mayor impacto en el uso]

- [ ] **CAP-01 · P1** Campo de carga en una línea, siempre disponible: `Enviar propuesta @Santi 15/11 #Mipileta !alta`. Reutilizar `parseAction`. Acepta: crear una tarea toma menos de 5 segundos, solo con teclado y sin abrir un formulario. Ref: Trello.
- [ ] **CAP-02 · P1** Interpretar fechas naturales en español: hoy, mañana, viernes, próxima semana, fin de mes.
- [ ] **CAP-03 · P1** Vista previa de lo interpretado mientras se escribe, con posibilidad de corregir.
- [ ] **CAP-04 · P1** Atajo global `N` para nueva tarea y `Ctrl/Cmd+K` para la paleta de comandos.
- [ ] **CAP-05 · P1** Formulario de tarea en dos niveles: título, responsable, fecha y cliente visibles; el resto en "Más opciones". Hoy tiene 11 campos.
- [ ] **CAP-06 · P1** Recordar el último cliente y responsable usados, y completar el cliente según la pantalla actual.
- [ ] **CAP-07 · P1** Bandeja de entrada: anotar sin clasificar y ordenar después. Ref: Trello Inbox.
- [ ] **CAP-08 · P1** Ronda de orden de la bandeja: de a una, con teclas para asignar, poner fecha, convertir en tarea o descartar.
- [ ] **CAP-09 · P2** Crear tareas reenviando un mail a una etiqueta de Gmail, con Apps Script. Ref: Trello.
- [ ] **CAP-10 · P2** Compartir a la app desde WhatsApp u otras apps en Android (Web Share Target). Depende de MOV-01.
- [ ] **CAP-11 · P2** Dictado por voz con Web Speech API, cuando el navegador lo permita.
- [ ] **CAP-12 · P2** Pegar varias líneas crea varias tareas, con revisión previa.
- [ ] **CAP-13 · P2** Pegar un mensaje de WhatsApp en la carga rápida y detectar la tarea. Reutilizar `extractActions`.
- [ ] **CAP-14 · P2** Agregar tarjetas al tablero escribiendo directamente en la columna, sin modal.
- [ ] **CAP-15 · P2** Editar título, fecha y responsable directamente en la lista.
- [ ] **CAP-16 · P3** Extensión o marcador de navegador para crear una tarea desde cualquier página, con el enlace incluido.
- [ ] **CAP-17 · P3** Duplicar tarea.
- [ ] **CAP-18 · P3** Convertir una actualización de cliente en tarea con un clic.

---

## Fase 5A. Diseño claro, gráficos e intuición [pedido expreso de Diogenes]

Objetivo: una app clara, fácil de leer y de analizar de un vistazo. Esta fase se hace junto con la Fase 4 y la Fase 5, antes de las dos semanas de uso real.

### Todo en claro

- [ ] **CLA-01 · P1** Tema claro como único tema en toda la plataforma: login, Inicio, Operaciones, Crecimiento, Equipo, Ajustes, modales y avisos. `css/app.css` ya tiene los colores en `:root[data-theme="light"]` (línea 16), pero el oscuro es el predeterminado (línea 3): partir de esos colores y dejarlos como únicos. Acepta: ninguna pantalla se ve oscura, aunque el navegador tenga guardado `anm_theme=dark` o el sistema esté en modo oscuro.
- [ ] **CLA-02 · P1** Eliminar el botón "Modo claro / oscuro" de Ajustes (`App.toggleTheme` en `js/app.js`, botón en `js/home.js:88`) y el código de tema oscuro que deje de usarse.
- [ ] **CLA-03 · P1** Pasar también a claro `finanzas.html` y `finanzas-completa.html`, incluida la pantalla de contraseña. `finanzas-completa.html` define sus propios colores oscuros (línea 10) y no tiene tema claro. Ajustar además los colores de texto y grilla de sus gráficos.
- [ ] **CLA-04 · P1** Cambiar `theme-color` a un color claro en `index.html` y `finanzas.html`, y revisar el logo (`logo.jpg`, de fondo oscuro) para que no quede como un recuadro negro.
- [ ] **CLA-05 · P1** Fondo blanco o gris muy claro, texto casi negro y un solo color de acento. Sin degradados oscuros en el encabezado de Inicio (`.hero`).
- [ ] **CLA-06 · P1** Legibilidad: texto de cuerpo de al menos 15 px, secundario de al menos 13 px, interlineado cómodo y contraste AA real, también en etiquetas y textos tenues (`.faint`, `.xs`). Los colores claros actuales no alcanzan 4,5:1 sobre blanco: `--text3` #9a9aa8 da 2,78; `--yellow` #b8860b, 3,25; `--teal` #12a08c, 3,26; `--green` #1a9e56, 3,46; `--red` #e8484a, 3,85. Oscurecerlos para usarlos en texto. Acepta: verificado con una auditoría automática de contraste en cada pantalla.
- [ ] **CLA-07 · P1** Revisar los colores puestos a mano en el JavaScript (`DEFAULT_UNITS`, `HEALTH`, `CONTENT_COL`) y las etiquetas translúcidas, para que se lean sobre fondo claro.
- [ ] **CLA-08 · P2** Más aire entre bloques y tablas con filas bien separadas, números alineados a la derecha y títulos que digan la conclusión.
- [ ] **CLA-09 · P2** Revisar los mails de `apps-script/Recordatorios.gs`, para que usen el mismo estilo claro.

### Más gráficos para analizar

Regla: cada gráfico responde una pregunta concreta, escrita como título, y permite hacer clic para ver las tareas o los clientes detrás del dato. Sin gráficos decorativos.

- [ ] **GRA-01 · P1** Usar Chart.js, que Finanzas ya carga (versión 4.4.0 en `finanzas.html:36`), y sumarlo a `index.html` con la misma versión fija. Crear un componente común en `js/charts.js` y una paleta apta para fondo claro y para daltonismo. Hoy la plataforma no tiene gráficos reales fuera de Finanzas; solo barras hechas con CSS.
- [ ] **GRA-02 · P1** Pantalla nueva "Análisis" en el menú, con filtros de período, cliente, persona y unidad. Los filtros se aplican a todos sus gráficos.
- [ ] **GRA-03 · P1** Operaciones, "¿Se está atrasando el trabajo?": tareas abiertas por semana, separando a tiempo y vencidas.
- [ ] **GRA-04 · P1** Operaciones, "¿Cerramos más de lo que entra?": tareas creadas contra cerradas por semana.
- [ ] **GRA-05 · P1** Clientes, "¿Qué cuenta necesita atención?": barras por cliente con abiertas, vencidas y días sin actualizar, ordenadas de peor a mejor.
- [ ] **GRA-06 · P1** Equipo, "¿Quién está cargado?": tareas abiertas y vencidas por persona. Visible según la decisión sobre métricas individuales.
- [ ] **GRA-07 · P1** Entregables, "¿Llegamos con los calendarios y reportes?": avance del mes por cliente, con la fecha límite marcada.
- [ ] **GRA-08 · P1** Finanzas (solo socios): revisar los gráficos existentes (`js/fin.js:356`, `js/finanzas-extra.js:255` y los de `finanzas-completa.html`) y llevar a la vista simple ingresos, gastos y ganancia por mes. No duplicar los que ya existen.
- [ ] **GRA-09 · P1** Finanzas: ingresos por cliente y concentración, para ver cuánto depende la agencia de cada uno. Reemplazar la torta de `finanzas-completa.html:1408` por barras ordenadas.
- [ ] **GRA-10 · P1** Finanzas: proyección de 12 meses contra la meta anual, reutilizando `ch-proj` de `js/fin.js:350`. Si esa información ya está completa, marcar el ítem como resuelto.
- [ ] **GRA-11 · P1** Crecimiento: reemplazar las barras actuales del embudo por un gráfico con conversión entre etapas y dónde se pierden los prospectos.
- [ ] **GRA-12 · P2** Crecimiento: contactos por semana contra la meta, y oportunidades por fuente.
- [ ] **GRA-13 · P2** Operaciones: tiempo promedio desde que se crea una tarea hasta que se cierra, por tipo de trabajo.
- [ ] **GRA-14 · P2** Operaciones: distribución de tareas por estado y por unidad.
- [ ] **GRA-15 · P2** Contenido: piezas por estado y publicadas contra planificadas, por cliente y mes.
- [ ] **GRA-16 · P2** Aprobaciones: días que tarda cada cliente en aprobar.
- [ ] **GRA-17 · P2** Ficha de cliente: mini tendencia de tareas cerradas, atrasos y salud en el tiempo.
- [ ] **GRA-18 · P2** Inicio: un solo gráfico chico con el avance propio de la semana, sin sumar más bloques.
- [ ] **GRA-19 · P2** Horas: estimado contra real y rentabilidad por cliente, cuando existan HOR-01 y HOR-04.
- [ ] **GRA-20 · P2** Comparar cada indicador con el período anterior, con una flecha y el porcentaje de cambio.
- [ ] **GRA-21 · P2** Estados vacíos y datos insuficientes: decir qué falta cargar, en lugar de mostrar un gráfico engañoso.
- [ ] **GRA-22 · P2** Accesibilidad de los gráficos: etiquetas directas, ayuda al pasar el cursor, tabla equivalente y lectura correcta en el celular.
- [ ] **GRA-23 · P3** Descargar cualquier gráfico como imagen y exportar sus datos a CSV.
- [ ] **GRA-24 · P3** Resumen de una frase generado desde los datos debajo de cada gráfico, por ejemplo: "Mipileta concentra el 40 % de las vencidas".

### Más intuitiva

- [ ] **INT-01 · P1** Prueba de los 5 segundos: en cada pantalla debe entenderse dónde se está y cuál es el siguiente paso. Documentar el antes y el después con capturas.
- [ ] **INT-02 · P1** Menú con nombres comunes: "Hoy", "Tareas", "Clientes", "Reuniones", "Ventas", "Análisis", "Finanzas". Las tareas no deben quedar escondidas dentro de "Operaciones".
- [ ] **INT-03 · P1** Un solo botón principal "Crear", que abra la carga rápida. Quitar los botones repetidos ("+ Tarea", "+ Agregar", "+ Crear") donde no aporten.
- [ ] **INT-04 · P1** Reducir los filtros siempre visibles en Operaciones. Hoy hay dos filas de filtros y una de pestañas antes del contenido: dejar el cliente visible y el resto en "Filtros".
- [ ] **INT-05 · P1** Toda tarea, alerta o número lleva a su detalle con un clic. No debe haber datos sin salida.
- [ ] **INT-06 · P1** Botones con texto claro en lugar de íconos sueltos, y ayudas breves en las funciones menos evidentes ("Área", "Unidad", "Nota para el cliente").
- [ ] **INT-07 · P1** Unificar "Seguimiento", "Actualización" y "Status" en una sola idea que se entienda sin explicación (coordinar con UX-13).
- [ ] **INT-08 · P2** Confirmación visible de cada acción, con opción de deshacer (DATOS-07), sin celebraciones.
- [ ] **INT-09 · P2** Migas de navegación y botón "Volver" consistentes en fichas y detalles.
- [ ] **INT-10 · P2** Colores con el mismo significado en toda la app: rojo atrasado, amarillo atención, verde al día, azul acción.
- [ ] **INT-11 · P2** Prueba con Luisina, Luli e Inés: pedirles que creen una tarea, carguen una minuta y encuentren lo vencido, y anotar dónde dudan.

---

## Fase 5. Inicio simple

- [ ] **INI-01 · P1** Inicio por defecto: solo "Hoy", "Vencidas", "Reuniones de hoy" y carga rápida.
- [ ] **INI-02 · P1** Pasar actividad, ranking, insignias y "Cómo se mide" a una pantalla aparte ("Equipo" o "Métricas").
- [ ] **INI-03 · P1** Marcar una tarea como hecha desde Inicio con un toque y sin recargar la pantalla.
- [ ] **INI-04 · P1** Reprogramar en un toque: hoy, mañana, próxima semana.
- [ ] **INI-05 · P1** Gamificación apagada por defecto con un ajuste por persona (ver decisiones). Sacar el confeti de las acciones comunes.
- [ ] **INI-06 · P1** Máximo tres alertas visibles en Inicio, solo las propias y urgentes.
- [ ] **INI-07 · P2** Ranking oculto mientras el equipo tenga menos de tres personas activas.
- [ ] **INI-08 · P2** "Mi semana": vista de siete días con tareas por día, reprogramables arrastrando. Ref: Trello Planner.
- [ ] **INI-09 · P2** Ritual de inicio del día: elegir hasta tres prioridades.
- [ ] **INI-10 · P2** Cierre del día: qué quedó pendiente y pasarlo a mañana en un toque.
- [ ] **INI-11 · P2** Vista del socio: un resumen por persona y cliente, con riesgos y atrasos.
- [ ] **INI-12 · P3** Inicio configurable por rol.
- [ ] **INI-13 · P3** Saludo sin datos de rendimiento cuando no hay datos del mes.

---

## Fase 6. Tareas

- [ ] **TAR-01 · P1** Comentarios en cada tarea, con historial. Ref: ClickUp, Monday.
- [ ] **TAR-02 · P1** Menciones con `@` en comentarios, que generen un aviso.
- [ ] **TAR-03 · P1** Checklist dentro de la tarea, sin campos propios por ítem. Ref: ClickUp.
- [ ] **TAR-04 · P2** Subtareas con responsable y fecha, derivadas de un ítem del checklist.
- [ ] **TAR-05 · P2** Adjuntos con Supabase Storage y vista previa de imágenes; solo después de la Fase 1. Ref: Notion, Monday.
- [ ] **TAR-06 · P2** Vista previa automática de enlaces de Canva, Drive y Figma.
- [ ] **TAR-07 · P2** Dependencias simples: "bloqueada por", con un distintivo y un aviso al desbloquearse. Ref: ClickUp.
- [ ] **TAR-08 · P2** Estado "Esperando a" (cliente o persona), con fecha de seguimiento.
- [ ] **TAR-09 · P2** Seguidores: otras personas reciben novedades sin ser responsables.
- [ ] **TAR-10 · P2** Varios responsables o un revisor, si hace falta (ver decisiones).
- [ ] **TAR-11 · P2** Etiquetas libres con autocompletado.
- [ ] **TAR-12 · P2** Orden manual dentro de la columna, sin perder el orden por fecha como alternativa.
- [ ] **TAR-13 · P2** Página propia para cada tarea, con enlace para compartir (`#/ops/tarea/ID`).
- [ ] **TAR-14 · P2** Panel lateral en lugar de modal, para no perder el contexto.
- [ ] **TAR-15 · P2** Avisar si se crea una tarea casi igual a otra abierta del mismo cliente.
- [ ] **TAR-16 · P2** Estados por tipo de trabajo, opcionales (por ejemplo: guion, diseño, revisión, aprobado).
- [ ] **TAR-17 · P2** Estimación simple: chica, mediana o grande.
- [ ] **TAR-18 · P3** Fecha de inicio además de vencimiento, para el cronograma.
- [ ] **TAR-19 · P3** Mover una tarea a otro cliente desde la propia tarea.
- [ ] **TAR-20 · P3** Archivar en bloque lo hecho hace más de 90 días.
- [ ] **TAR-21 · P3** Tareas privadas personales.
- [ ] **TAR-22 · P3** Bloque de tiempo sugerido según la estimación.

---

## Fase 7. Recurrencia, plantillas y automatizaciones

### Recurrencia

- [ ] **REC-01 · P1** Tareas recurrentes: diaria, semanal, mensual, día del mes, último día hábil. Se crea la siguiente al completar o en la fecha definida. Ref: ClickUp.
- [ ] **REC-02 · P1** Generar solas las tareas del reporte y del calendario mensual según `reportDay` y `calendarDay` de cada cliente.
- [ ] **REC-03 · P2** Saltar una repetición sin cortar la serie.
- [ ] **REC-04 · P2** Ajustar la fecha si cae en fin de semana o feriado argentino.

### Plantillas

- [ ] **PLA-01 · P1** Plantillas de tareas: conjunto con responsable por rol y fechas relativas. Ref: Notion, Teamwork.
- [ ] **PLA-02 · P1** Plantillas iniciales: onboarding de cliente, web o e-commerce, branding, lanzamiento de campaña de pauta, reporte mensual, calendario mensual, producción de fotos.
- [ ] **PLA-03 · P1** Al aplicar una plantilla, elegir cliente y fecha de inicio, y revisar antes de crear.
- [ ] **PLA-04 · P2** Guardar un conjunto de tareas existente como plantilla.
- [ ] **PLA-05 · P2** Al pasar un prospecto a cliente, elegir la plantilla según el servicio vendido. Hoy `Growth.toClient` crea una sola tarea de onboarding.
- [ ] **PLA-06 · P2** Plantillas de reunión con agenda: kickoff, seguimiento, reporte.
- [ ] **PLA-07 · P3** Plantillas de brief por servicio.

### Automatizaciones

- [ ] **AUT-01 · P2** Motor simple "cuando pasa X, hacer Y", configurable por los socios. Ref: Monday, ClickUp.
- [ ] **AUT-02 · P2** Recetas listas: pasa a En revisión y avisa al revisor; se completa y avisa al que sigue; vencida hace 2 días y avisa a un socio; cliente en riesgo y crea tarea de contacto.
- [ ] **AUT-03 · P2** Ejecutar en el servidor con Edge Functions o Apps Script, no solo con la app abierta.
- [ ] **AUT-04 · P2** Registro de lo que hizo cada automatización.
- [ ] **AUT-05 · P3** Webhooks de salida para conectar con otras herramientas.

---

## Fase 8. Reuniones y minutas

- [ ] **MIN-01 · P1** Entrada automática desde Read AI: investigar webhook o integración; como alternativa, leer los mails de resumen con Apps Script y una etiqueta de Gmail. Las reuniones quedan en una bandeja para revisar, no se cargan solas.
- [ ] **MIN-02 · P1** Ordenar reunión en modo automático con usuario autenticado (depende de SEG-06), sin copiar y pegar en Claude.
- [ ] **MIN-03 · P1** Formulario de reunión en dos pasos: primero pegar el texto; después revisar lo detectado. Hoy ocupa más de una pantalla.
- [ ] **MIN-04 · P1** Reemplazar "Detectar acuerdos" (`extractActions`, basado en patrones) por el mismo proceso con IA, y mantener el actual como respaldo sin conexión.
- [ ] **MIN-05 · P2** Sincronizar reuniones desde Google Calendar y sugerir la minuta al terminar.
- [ ] **MIN-06 · P2** Asociar la reunión al cliente según los invitados del calendario.
- [ ] **MIN-07 · P2** Cargar un audio y obtener la minuta (transcripción mediante un servicio a definir).
- [ ] **MIN-08 · P2** Aviso a los participantes con el resumen y sus tareas al guardar. Ya existe por botón; hacerlo opción por defecto.
- [ ] **MIN-09 · P2** Revisar al inicio de cada reunión los pendientes de la anterior con ese cliente.
- [ ] **MIN-10 · P2** Compartir la minuta con el cliente por un enlace de solo lectura (depende de la Fase 1).
- [ ] **MIN-11 · P2** Buscar en minutas y decisiones de todos los clientes, y consultar: "¿qué decidimos con Mipileta sobre precios?".
- [ ] **MIN-12 · P2** Registro de decisiones por cliente, separado de las minutas.
- [ ] **MIN-13 · P2** Agenda previa a la reunión, editable por el equipo.
- [ ] **MIN-14 · P3** Plantilla de mail de seguimiento generada desde la minuta.
- [ ] **MIN-15 · P3** Detectar compromisos del cliente, además de los de ANM, y seguirlos.

---

## Fase 9. Clientes y portal

### Ficha del cliente

- [ ] **CLI-01 · P1** Alta masiva de clientes activos e importación desde Finanzas guiada, para arrancar con datos reales.
- [ ] **CLI-02 · P2** Ficha con pestañas: Resumen, Tareas, Contenido, Reuniones, Documentos, Accesos.
- [ ] **CLI-03 · P2** Datos fijos del cliente: tono de marca, público, competidores, objetivos.
- [ ] **CLI-04 · P2** Accesos: lista de dónde está cada acceso, sin guardar contraseñas en esta base (ver decisiones).
- [ ] **CLI-05 · P2** Varios contactos por cliente, con rol.
- [ ] **CLI-06 · P2** Salud calculada a partir de atrasos, días sin contacto y aprobaciones demoradas, con posibilidad de corregirla a mano.
- [ ] **CLI-07 · P2** Línea de tiempo por cliente: reuniones, entregas, cambios y mensajes.
- [ ] **CLI-08 · P3** Alcance contratado por cliente y aviso cuando se pide algo fuera de él.
- [ ] **CLI-09 · P3** Renovaciones y fechas de contrato con alertas.
- [ ] **CLI-10 · P3** Encuesta de satisfacción periódica.

### Portal de clientes (después de la Fase 1)

- [ ] **POR-01 · P2** Enlace privado por cliente, con vencimiento y sin acceso al resto de la plataforma. Ref: Teamwork.
- [ ] **POR-02 · P2** Vista "En qué estamos" alimentada por las mismas tareas que el status actual, usando solo el campo `note`, nunca `desc`.
- [ ] **POR-03 · P2** Aprobar o pedir cambios por pieza, sin necesidad de cuenta. Ref: Teamwork.
- [ ] **POR-04 · P2** Comentarios del cliente sobre la imagen o el video, con varias rondas y versiones.
- [ ] **POR-05 · P2** Calendario de contenido visible para el cliente.
- [ ] **POR-06 · P2** Aviso al equipo cuando el cliente aprueba o comenta.
- [ ] **POR-07 · P3** Recordatorio automático al cliente si una aprobación lleva más de N días.
- [ ] **POR-08 · P3** Formulario de pedidos del cliente, que entra en la bandeja. Ref: Monday, Teamwork.
- [ ] **POR-09 · P3** Reportes mensuales publicados en el portal.
- [ ] **POR-10 · P3** Identidad visual de ANM en el portal.

---

## Fase 10. Contenido y calendario

- [ ] **CON-01 · P1** Arrastrar piezas entre días del calendario.
- [ ] **CON-02 · P1** Calendario legible en el celular: hoy los eventos se reducen a marcas de 6 px (`.cal .ev` en `css/app.css`). Usar agenda por lista en pantallas chicas.
- [ ] **CON-03 · P2** Vista de grilla de contenido por cliente, con miniaturas.
- [ ] **CON-04 · P2** Campos separados para copy, hashtags, referencia, pieza final y enlace publicado.
- [ ] **CON-05 · P2** Plan mensual generado en un paso a partir de una frecuencia por cliente.
- [ ] **CON-06 · P2** Duplicar un mes como base del siguiente.
- [ ] **CON-07 · P2** Banco de ideas por cliente, que se convierten en piezas.
- [ ] **CON-08 · P2** Flujo con responsables por etapa: redacción, diseño, revisión, publicación.
- [ ] **CON-09 · P2** Filtrar por red, formato y responsable.
- [ ] **CON-10 · P3** Efemérides y fechas comerciales argentinas en el calendario.
- [ ] **CON-11 · P3** Publicar o programar en redes, evaluando costos y permisos de las API.
- [ ] **CON-12 · P3** Traer métricas de cada publicación.
- [ ] **CON-13 · P3** Biblioteca de recursos de marca por cliente.
- [ ] **CON-14 · P3** Exportar el calendario para Canva o PDF.

---

## Fase 11. Capacidad, horas y rentabilidad

- [ ] **CAR-01 · P2** Vista de carga por persona y semana, con avisos de exceso. Ref: Monday, Teamwork.
- [ ] **CAR-02 · P2** Capacidad configurable por persona, considerando vacaciones y ausencias.
- [ ] **CAR-03 · P2** Reasignar arrastrando desde la vista de carga.
- [ ] **HOR-01 · P2** Temporizador y carga manual de horas en cada tarea, siempre opcional. Ref: ClickUp, Teamwork.
- [ ] **HOR-02 · P2** Resumen semanal de horas por persona y cliente.
- [ ] **HOR-03 · P2** Horas contratadas por cliente (retainer), con aviso al 80 % y al 100 %. Ref: Teamwork.
- [ ] **HOR-04 · P2** Rentabilidad por cliente solo para socios: ingreso de Finanzas contra costo por horas.
- [ ] **HOR-05 · P3** Costo por hora por persona, visible solo para socios.
- [ ] **HOR-06 · P3** Comparar lo estimado con lo real para mejorar los presupuestos.
- [ ] **HOR-07 · P3** Presupuesto de proyecto one-shot con avance y desvío. Ref: Teamwork.
- [ ] **HOR-08 · P3** Recordatorio semanal de horas sin cargar.

---

## Fase 12. Vistas y búsqueda

- [ ] **VIS-01 · P1** Búsqueda global en tareas, clientes, reuniones, contenido y prospectos, con `Ctrl/Cmd+K`.
- [ ] **VIS-02 · P2** Filtros combinables en tareas: cliente, persona, estado, prioridad, fecha y etiqueta.
- [ ] **VIS-03 · P2** Vistas guardadas, con enlace propio. Ref: Notion, Monday.
- [ ] **VIS-04 · P2** Agrupar lista y tablero por cliente, persona o unidad.
- [ ] **VIS-05 · P2** Cronograma para proyectos largos. Ref: Monday, Notion.
- [ ] **VIS-06 · P2** Vista "Sin responsable" y "Sin fecha", para ordenar.
- [ ] **VIS-07 · P2** Vista "Esperando al cliente" por cuenta.
- [ ] **VIS-08 · P2** Mostrar siempre los filtros activos con opción de limpiarlos.
- [ ] **VIS-09 · P3** Vista de tabla con columnas ordenables.
- [ ] **VIS-10 · P3** Tablero de proyectos, por encima de las tareas.
- [ ] **VIS-11 · P3** Vista de galería para piezas de contenido.

---

## Fase 13. Crecimiento (CRM)

- [ ] **CRM-01 · P1** Conciliar prospectos y clientes actuales (ver BUG-21).
- [ ] **CRM-02 · P2** Registrar de forma automática las respuestas a mails de prospectos, mediante una etiqueta de Gmail.
- [ ] **CRM-03 · P2** Pausar la secuencia de toques cuando el prospecto responde. Hoy el próximo contacto se agenda igual.
- [ ] **CRM-04 · P2** Motivos de pérdida en una lista, además del texto libre. Hoy se pide con `prompt`.
- [ ] **CRM-05 · P2** Duplicados: detectar por web, mail o teléfono, no solo por nombre.
- [ ] **CRM-06 · P2** Crear propuestas desde una plantilla y dejar registro de su versión.
- [ ] **CRM-07 · P2** Saber cuándo se abrió una propuesta, con un enlace medible.
- [ ] **CRM-08 · P2** Personalizar el primer mensaje con IA a partir de la ficha, siempre con revisión humana.
- [ ] **CRM-09 · P2** Agendar reuniones desde el prospecto y sincronizar con Google Calendar.
- [ ] **CRM-10 · P2** Importar referidos y contactos desde un CSV con vista previa de columnas.
- [ ] **CRM-11 · P3** Puntaje automático según rubro, tamaño y señales digitales.
- [ ] **CRM-12 · P3** Valor estimado de la oportunidad, visible solo para socios. Hoy Crecimiento evita los montos a propósito; confirmar.
- [ ] **CRM-13 · P3** Plan de recontacto para ex clientes, con motivos y próxima fecha.
- [ ] **CRM-14 · P3** Formulario de la web de ANM que crea el prospecto.
- [ ] **CRM-15 · P3** Seguimiento de contenidos de LinkedIn y su efecto sobre prospectos.

No automatizar el envío masivo de mensajes por WhatsApp, LinkedIn o Instagram. Los envíos siguen a cargo de una persona.

---

## Fase 14. Documentos y conocimiento

- [ ] **DOC-01 · P2** Wiki interna simple: páginas con títulos y enlaces, editables por el equipo. Ref: Notion.
- [ ] **DOC-02 · P2** Procedimientos iniciales: reporte, calendario, alta de cliente, campaña, entrega de web.
- [ ] **DOC-03 · P2** Documentos por cliente: brief, estrategia, accesos y enlaces a carpetas.
- [ ] **DOC-04 · P2** Enlazar procedimientos desde las plantillas de tareas.
- [ ] **DOC-05 · P2** Buscar también en documentos (VIS-01).
- [ ] **DOC-06 · P3** Preguntar a la IA sobre procedimientos y minutas, citando la fuente.
- [ ] **DOC-07 · P3** Guía de ingreso para personas nuevas.
- [ ] **DOC-08 · P3** Biblioteca de ejemplos: propuestas, casos y reportes modelo.

---

## Fase 15. Notificaciones e integraciones

- [ ] **NOT-01 · P1** Validar el flujo de mails: que el script esté instalado, que cada persona tenga mail cargado y que se avise si deja de ejecutarse. El perfil de Diogenes figura "sin email".
- [ ] **NOT-02 · P1** Cargar email y teléfono como parte del ingreso de cada persona.
- [ ] **NOT-03 · P2** Notificaciones push en el navegador y en el celular. Hoy no hay ninguna. Depende de MOV-01.
- [ ] **NOT-04 · P2** Preferencias por tipo de aviso y canal. Hoy el mail es todo o nada.
- [ ] **NOT-05 · P2** Horario de silencio y resumen diario configurable.
- [ ] **NOT-06 · P2** Agrupar avisos para no enviar uno por cada cambio.
- [ ] **NOT-07 · P2** Marcar como hecha o reprogramar desde el mail, con un enlace seguro.
- [ ] **NOT-08 · P2** Enviar los avisos urgentes de inmediato. Hoy se revisan cada hora.
- [ ] **NOT-09 · P2** Bloques de agenda en Google Calendar para tareas con fecha.
- [ ] **NOT-10 · P2** Calendario suscribible (formato ICS) con tareas y reuniones de cada persona.
- [ ] **NOT-11 · P2** Adjuntar desde Google Drive con selector de archivos.
- [ ] **NOT-12 · P3** Integrar WhatsApp Business solo para avisos internos, evaluando costos y políticas de la API.
- [ ] **NOT-13 · P3** Slack, si el equipo lo adopta. Ref: Trello.
- [ ] **NOT-14 · P3** Canva y Figma: mostrar la miniatura desde el enlace.
- [ ] **NOT-15 · P3** Traer datos de Meta Ads y Google Ads para el reporte.
- [ ] **NOT-16 · P3** Traer datos de Tienda Nube y Shopify al reporte de clientes de e-commerce.
- [ ] **NOT-17 · P3** API propia documentada para conectar agentes.

---

## Fase 16. Celular

- [ ] **MOV-01 · P1** Aplicación instalable: `manifest.json`, íconos y service worker. Hoy no tiene.
- [ ] **MOV-02 · P1** Navegación inferior: Hoy, Tareas, Crear, Clientes, Más.
- [ ] **MOV-03 · P1** Botón flotante de carga rápida.
- [ ] **MOV-04 · P1** Tablero usable en el celular (ver BUG-25), o lista por defecto en pantallas chicas.
- [ ] **MOV-05 · P2** Formularios como hoja inferior a pantalla completa.
- [ ] **MOV-06 · P2** Gestos: deslizar para completar o reprogramar.
- [ ] **MOV-07 · P2** Áreas táctiles de al menos 44 px.
- [ ] **MOV-08 · P2** Barra de selección múltiple que no tape el contenido (`.selbar`).
- [ ] **MOV-09 · P2** Fotos desde la cámara como adjuntos, útil en producciones.
- [ ] **MOV-10 · P3** Uso sin conexión con DATOS-05.
- [ ] **MOV-11 · P3** Widget o atajo de carga en iOS y Android, si la plataforma lo permite.

---

## Fase 17. Reportes y métricas

- [ ] **REP-01 · P2** Reporte semanal automático para socios: hecho, atrasado, riesgos, próximos entregables.
- [ ] **REP-02 · P2** Plazos cumplidos por cliente y por tipo de entrega.
- [ ] **REP-03 · P2** Cuántos días tarda cada aprobación y dónde se traba el trabajo.
- [ ] **REP-04 · P2** Tareas creadas contra cerradas, para ver si el pendiente crece.
- [ ] **REP-05 · P2** Uso real: quién entra y carga tareas por semana. Sirve para medir la adopción.
- [ ] **REP-06 · P2** Revisar las métricas personales: hoy las tareas sin fecha no cuentan hasta completarse y puede premiarse cargar menos. Definir medidas que no castiguen la carga.
- [ ] **REP-07 · P2** Resumen mensual por cliente generado desde tareas, minutas y contenido, listo para revisar.
- [ ] **REP-08 · P3** Tablero de ventas a operación: prospecto ganado, tiempo hasta el kickoff.
- [ ] **REP-09 · P3** Exportar reportes a PDF.
- [ ] **REP-10 · P3** Motivos de baja de clientes y su relación con atrasos.

---

## Fase 18. Inteligencia artificial

Siempre con revisión humana antes de guardar o enviar.

- [ ] **IA-01 · P2** Pasar el puente de IA a una Edge Function (depende de SEG-06), con registro de uso y costo por mes.
- [ ] **IA-02 · P2** Asistente de carga: escribir un pedido libre y obtener tareas sugeridas.
- [ ] **IA-03 · P2** Resumen diario para socios en lenguaje natural.
- [ ] **IA-04 · P2** Preguntar por un cliente: "¿en qué estamos con Mipileta?", con respuesta citada desde tareas y minutas.
- [ ] **IA-05 · P2** Borrador de actualización para el cliente desde lo hecho en la semana.
- [ ] **IA-06 · P2** Sugerir responsable y fecha según trabajos similares.
- [ ] **IA-07 · P2** Detectar riesgos: clientes sin contacto, tareas estancadas, compromisos incumplidos.
- [ ] **IA-08 · P3** Convertir un brief en plan de tareas con una plantilla.
- [ ] **IA-09 · P3** Limpiar tareas viejas: proponer cierre, unión o nueva fecha.
- [ ] **IA-10 · P3** Agentes programados que preparen el trabajo y dejen todo para aprobar. Sin acciones externas automáticas.
- [ ] **IA-11 · P3** Límite mensual configurable de gasto en la API.

---

## Fase 19. Diseño, claridad y accesibilidad

- [ ] **UX-01 · P1** Reducir la densidad: una acción principal por pantalla y menos contadores en rojo.
- [ ] **UX-02 · P1** Pantallas vacías que digan qué hacer, con un botón que resuelva el siguiente paso.
- [ ] **UX-03 · P1** Guía inicial de tres pasos para cada rol, que se pueda saltar.
- [ ] **UX-04 · P2** Reducir los emojis de la interfaz y usar una familia de íconos propia, para un tono más profesional.
- [ ] **UX-05 · P2** Atajos de teclado en listas y tablero, con ayuda en `?`.
- [ ] **UX-06 · P2** Navegación con teclado: hoy muchas filas son `div` con `onclick`.
- [ ] **UX-07 · P2** Atributos ARIA y foco controlado en modales. Hoy casi no hay.
- [ ] **UX-08 · P2** Mantener el contraste AA logrado en CLA-06 en toda pantalla nueva.
- [ ] **UX-09 · P2** No depender solo del color en estados y prioridades.
- [ ] **UX-10 · P2** Respetar la preferencia de sistema de movimiento reducido (`prefers-reduced-motion`). El tema es siempre claro.
- [ ] **UX-11 · P2** Mensajes de error que digan qué hacer. Evitar textos técnicos en pantalla.
- [ ] **UX-12 · P2** Carga con esqueletos en lugar de pantallas en blanco.
- [ ] **UX-13 · P2** Revisar nombres: "Seguimiento", "Actualización" y "Status" se parecen; unificar criterios y explicarlos.
- [ ] **UX-14 · P2** Unificar el uso de `Reuniones` y `Status` guardados como reunión (`meeting.type = 'status'`), para no mezclarlos en la lista.
- [ ] **UX-15 · P3** Personalizar la densidad: cómoda o compacta.
- [ ] **UX-16 · P3** Vista de impresión para minutas y reportes.

---

## Fase 20. Calidad técnica

- [ ] **TEC-01 · P2** Dividir `js/ops.js` (904 líneas) por pantalla: seguimiento, tareas, calendario, reuniones, alertas, importación.
- [ ] **TEC-02 · P2** Separar lógica y presentación para poder probar sin el navegador.
- [ ] **TEC-03 · P2** Pruebas unitarias de `parseStatus`, `parseAction`, `extractActions`, `Game.perf`, `mergeDocs` y `allAlerts`.
- [ ] **TEC-04 · P2** Redibujar solo lo que cambió, sin reescribir toda la página.
- [ ] **TEC-05 · P2** Revisar rendimiento con 1.000 tareas: `allAlerts` y `lastUpdate` recorren colecciones completas por cliente en cada dibujado.
- [ ] **TEC-06 · P2** Validar datos en un único lugar, con esquema por entidad.
- [ ] **TEC-07 · P2** Quitar el dato de XP y funciones antiguas (`xpOf`, nombre conservado por compatibilidad en `js/game.js:53`), según INI-05.
- [ ] **TEC-08 · P2** Reemplazar el `esc` duplicado en `js/reunion.js` por el de `UI`.
- [ ] **TEC-09 · P3** ESLint y Prettier.
- [ ] **TEC-10 · P3** Tipos con JSDoc, sin necesidad de compilar.
- [ ] **TEC-11 · P3** Evaluar si conviene pasar a un framework. Solo si el mantenimiento lo justifica; no como primer paso.
- [ ] **TEC-12 · P3** Documentar arquitectura y modelo de datos en `docs/`.
- [ ] **TEC-13 · P3** Cargar solo la fuente y los pesos necesarios de Montserrat.

---

## Fase 21. Adopción

Sin esto, las demás fases no resuelven el problema de uso.

- [ ] **ADO-01 · P1** Pantalla de puesta en marcha para socios: cargar equipo, mails, clientes activos y pendientes, con su avance.
- [ ] **ADO-02 · P1** Cargar las 26 tareas pendientes del status de Mipileta, revisando primero si son vigentes.
- [ ] **ADO-03 · P1** Importar en una sola tanda los pendientes actuales de cada cliente, desde texto pegado.
- [ ] **ADO-04 · P1** Corregir los datos desactualizados del CRM (por ejemplo, Hidronorte) con un proceso guiado.
- [ ] **ADO-05 · P1** Modo reunión semanal: repasar por cliente lo vencido y lo próximo, en 15 minutos.
- [ ] **ADO-06 · P2** Aviso de tareas que llevan más de 14 días sin cambios: cerrar, reprogramar o quitar.
- [ ] **ADO-07 · P2** Limitar el trabajo en curso por persona, con un aviso suave.
- [ ] **ADO-08 · P2** Indicador de "Datos al día" por persona, sin ranking ni castigos.
- [ ] **ADO-09 · P2** Encuesta interna de un minuto, a los 14 días: qué sobra y qué falta.
- [ ] **ADO-10 · P3** Ocultar por 30 días toda función que nadie use y evaluar su eliminación según REP-05.

---

## Decisiones de Diogenes

Preguntar antes de implementar:

1. **Permisos de tareas:** ¿el equipo puede editar y asignar tareas de otros, o solo los socios? Hoy no puede asignar y el código es inconsistente (SEG-14, BUG-01).
2. **Gamificación:** ¿se elimina, queda opcional o se conserva? Propuesta: apagada por defecto (INI-05).
3. **Ranking y porcentajes individuales:** ¿son visibles para todos o solo para socios?
4. **Autenticación:** ¿mail y contraseña, enlace por mail o cuenta de Google?
5. **Datos públicos en git:** ¿se reescribe el historial del repositorio para quitar `js/minutas.js` y `js/prospects-hunter.js`, o se pasa el repositorio a privado y se publica de otra forma? GitHub Pages con repositorio privado depende del plan de GitHub: confirmar.
6. **Accesos de clientes:** ¿se guardan solo referencias, o se contrata un gestor de contraseñas? Propuesta: no guardar contraseñas en esta base.
7. **Varios responsables:** ¿una tarea tiene uno solo o varios? Propuesta: uno y seguidores.
8. **Portal de clientes:** ¿enlace sin cuenta o usuario propio? Propuesta: enlace privado con vencimiento.
9. **Costos:** definir un tope mensual para la API de Claude, Supabase y otros servicios antes de activar lo que genere gastos.
10. **Límite de alcance:** ¿qué fases quedan fuera? Propuesta: terminar Fases 0, 1, 2, 4, 5, 5A, 16 (MOV-01 a 04) y 21, usar la app dos semanas y recién después decidir el resto.

## Orden recomendado

1. Fase 0 y Fase 1: proteger los datos.
2. Fase 2: corregir los errores P0 y P1.
3. Fase 5A (primero el tema claro y la intuición, CLA e INT; después los gráficos P1, GRA), Fase 4, Fase 5, MOV-01 a MOV-04 y Fase 21: resolver el uso diario.
4. **Dos semanas de uso real, medir y revisar este listado.**
5. REC-01, REC-02, PLA-01 a PLA-03, TAR-01 a TAR-03 y MIN-01 a MIN-04.
6. El resto, solo si el uso real lo justifica.
