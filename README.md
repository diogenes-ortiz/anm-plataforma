# ANM Content Studio · Plataforma interna

En vivo: https://diogenes-ortiz.github.io/anm-plataforma/ (Finanzas: `/finanzas.html`)

Plataforma de la agencia con tres áreas + equipo. No necesita instalación ni compilación: son archivos estáticos (se pueden subir a GitHub Pages igual que antes).

| Archivo | Qué es |
|---|---|
| `index.html` | Plataforma: Inicio, Operaciones, Crecimiento, Equipo, Ajustes |
| `finanzas.html` | Finanzas (la app de siempre) + contraseña, Análisis y Cierre del mes |
| `css/app.css` | Estilos de la plataforma (modo oscuro/claro) |
| `js/store.js` | Datos en Supabase con sincronización colaborativa |
| `js/app.js` | Acceso, roles, invitaciones, navegación, alertas manuales |
| `js/game.js` | Gamificación: XP, niveles, rachas, insignias, misiones semanales |
| `js/ops.js` | Operaciones |
| `js/growth.js` | Crecimiento / CRM |
| `js/prospects-hunter.js` | Base de 50 prospectos del informe Hunter |
| `js/home.js` | Inicio, Equipo y Ajustes |
| `js/finanzas-extra.js` | Contraseña, Análisis y Cierre del mes de Finanzas |

## Secciones

**Inicio** — tu foco del día (tareas, reuniones, seguimientos), alertas, misiones de la semana, ranking, insignias y actividad del equipo.

**Operaciones** — filtro por unidad de negocio (Social Media, Pauta, Branding, Web… editables en Ajustes).
- *Seguimiento*: tarjeta por cliente con semáforo (🟢/🟡/🔴), “en qué estamos”, próximo paso, días desde la última actualización. Historial completo en la ficha del cliente.
- *Tareas*: tablero arrastrable o lista agrupada (vencidas, hoy, esta semana…).
- *Calendario*: piezas de contenido, reuniones y tareas en un mes + estado del calendario mensual de cada cliente (por planificar → enviado → aprobado…).
- *Reuniones y minutas*: minuta, decisiones, temáticas (#etiquetas) y acuerdos. “✨ Detectar acuerdos” lee un resumen pegado (Read AI, Meet, etc.) y los convierte en tareas (`@Nombre` asigna, `dd/mm` pone fecha).
- *Alertas*: se calculan solas (clientes sin actualizar, en riesgo, tareas vencidas, reuniones sin minuta, calendarios sin aprobar, contenido por salir sin aprobar). “Avisar” la manda en la app, por WhatsApp o email.

**Crecimiento** (sin montos: todo lo económico vive en Finanzas)
- *Hoy toca contactar*: seguimientos vencidos primero y después los prospectos sin contactar, ordenados por **🔥 ganas** (1 a 5, se cambia con un clic).
- *Armar y mandar mensaje*: plantillas por toque (1º observación concreta, 2º aportar una idea, 3º credencial del rubro con MiPileta, recontacto de ex cliente) que se completan con los datos del prospecto. Se manda por WhatsApp, email o LinkedIn; queda registrado, pasa a “Contactado” y agenda el próximo toque a 4 días.
- *Ficha del prospecto*: oportunidad que vemos, con qué entraríamos y **puntos fuertes que le aportamos** según el enfoque (rescatar presencia / demanda + WhatsApp / performance-CRM).
- *Lista Hunter*: botón para importar los 50 prospectos del informe (sanitarios, grifería, bombas, calefacción) con contactos, decisores y pieza de entrada (`js/prospects-hunter.js`).
- *Etapas*: Queremos contactar → Contactado → Reunión → **🖼️ Armando la PPT** (crea sola la tarea “Armar PPT” con un brief listo para Canva/Slides y guarda el link) → PPT presentada → Negociación → **🏆 Pasó a cliente** (se crea automáticamente en Operaciones con su tarea de onboarding).
- Pipeline arrastrable, base de contactos (CSV), ex clientes con fecha de recontacto, plantillas editables y métricas (respuesta, cierre, embudo, fuentes).

**Finanzas** (solo socios, con contraseña) — todo lo de antes, más:
- *Análisis y comparativas*: período (mes, 3/6/12 meses, año, todo, personalizado) comparado con el período anterior o el mismo del año anterior; KPIs con variación, gráfico, ingresos por servicio, concentración de clientes, tabla mes a mes y conclusiones automáticas.
- *Cierre del mes*: preguntas mensuales (cobros, saldo real, imprevistos, cambios, ánimo…) editables, con racha de meses cerrados.
- La primera vez se crea la contraseña y se muestra un **código de recuperación**: guardalo. Se bloquea sola a los 20 minutos sin uso.

## Acceso y equipo
- Cada persona entra con **su nombre y contraseña** (se guarda cifrada con SHA-256 y sal propia, nunca en texto).
- El primero que entra crea su perfil de **socio** con contraseña.
- Los socios cargan perfiles desde **Equipo → Agregar persona** aunque la persona todavía no haya entrado, y ya le pueden asignar tareas. Después le mandan el acceso (link o código): la primera vez crea su contraseña.
- Si alguien se olvida la contraseña, un socio la resetea desde su tarjeta en Equipo.
- Roles: *Socio/a* (dueños: todo + Finanzas, cargan personas y asignan tareas a cualquiera), *Equipo* (Operaciones + Crecimiento; se asigna tareas a sí mismo), *Invitado/a* (solo Operaciones). Finanzas no aparece para quien no es socio y además pide su propia contraseña.

## Datos
Todo vive en la tabla `anm_state` de Supabase (la misma de siempre): `main` = Finanzas (sin cambios de formato), `ops`, `growth`, `team` = plataforma. Varias personas pueden editar a la vez: los cambios se fusionan registro por registro y se sincronizan cada ~20 s. Hay respaldo descargable en Ajustes.

**Seguridad:** la clave de Supabase es pública (está en el código), así que la contraseña y los roles evitan accesos casuales pero no son protección fuerte. Próximo paso recomendado: activar login por email de Supabase (Auth) y reglas RLS por rol.
