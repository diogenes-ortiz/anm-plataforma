/**
 * ANM · Recordatorios por mail (Google Apps Script)
 * ─────────────────────────────────────────────────
 * Manda mails desde TU Gmail a cada persona del equipo:
 *   • resumenDiario()  → todos los días a la mañana: tareas vencidas, de hoy y próximas,
 *                        reuniones del día y seguimientos del CRM. A los socios, además,
 *                        un resumen del equipo (clientes sin actualizar, tareas vencidas).
 *   • reporteCierre()  → todos los días a las 19 h, SOLO al dueño (Diogenes): todas las tareas
 *                        pendientes, ordenadas por empresa y por responsable.
 *   • avisosNuevos()   → cada hora: los avisos nuevos de la plataforma (tareas asignadas,
 *                        alertas mandadas con "Avisar", clientes en riesgo, nuevos clientes…).
 *
 * Instalación (una sola vez):
 *   1. Entrá a https://script.google.com con la cuenta de Gmail que va a mandar los mails → "Nuevo proyecto".
 *   2. Borrá lo que aparece y pegá TODO este archivo. Guardá (💾).
 *   3. ⚙ Configuración del proyecto → Zona horaria: "(GMT-03:00) Buenos Aires".
 *   3b. En esa misma pantalla, "Propiedades de la secuencia de comandos" → Agregar propiedad:
 *      SUPABASE_SERVICE_KEY = clave "secret" de Supabase (Project Settings → API Keys). Solo acá, nunca en el código.
 *   4. Arriba elegí la función "instalar" y tocá ▶ Ejecutar. Aceptá los permisos que pide Google
 *      (leer datos externos y enviar mails como vos).
 *   5. Para probar: elegí "probarConmigo" y ▶ Ejecutar → te llega un resumen de ejemplo.
 *      Para probar el reporte de las 19 h: elegí "probarReporte" y ▶ Ejecutar.
 * Cada persona necesita tener su email cargado en la plataforma (Equipo → Editar).
 */

const CONFIG = {
  SUPABASE_URL: 'https://pxsgqbldbdvbrfwqnvyl.supabase.co',
  PLATAFORMA: 'https://diogenes-ortiz.github.io/anm-plataforma/',
  HORA_RESUMEN: 8,              // hora del resumen diario (0-23)
  HORA_REPORTE: 19,             // hora del reporte de cierre del día (solo al dueño)
  RESUMEN_FINDE: false,         // true = también sábados y domingos
  ZONA: 'America/Argentina/Buenos_Aires',
  REMITENTE: 'ANM Plataforma',  // nombre que aparece como remitente
};

// ── Instalación ─────────────────────────────────────────────────────────────
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('resumenDiario').timeBased().everyDays(1).atHour(CONFIG.HORA_RESUMEN).inTimezone(CONFIG.ZONA).create();
  ScriptApp.newTrigger('reporteCierre').timeBased().everyDays(1).atHour(CONFIG.HORA_REPORTE).inTimezone(CONFIG.ZONA).create();
  ScriptApp.newTrigger('avisosNuevos').timeBased().everyHours(1).create();
  // No reenviar avisos viejos: arrancamos desde ahora
  PropertiesService.getScriptProperties().setProperty('avisos_desde', new Date().toISOString());
  Logger.log('✅ Listo: resumen diario a las ' + CONFIG.HORA_RESUMEN + ' h, reporte de cierre a las ' + CONFIG.HORA_REPORTE + ' h y avisos cada hora.');
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Recordatorios desactivados.');
}

// Manda el resumen de hoy solo a la cuenta que ejecuta el script (para probar).
// Nunca falla en silencio: si algo no está listo, te manda un mail explicando qué falta.
function probarConmigo() {
  const yo = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  Logger.log('Mandando la prueba a: ' + yo);
  let d, problema = '';
  try { d = datos(); } catch (e) { problema = 'No pude leer la base de datos de la plataforma: ' + e.message; }
  if (problema) {
    enviar(yo, '⚠️ ANM · Prueba de recordatorios: falta un paso', cuerpo('Casi listo', '<p>' + esc(problema) + '</p>'));
    Logger.log('⚠️ ' + problema); return;
  }
  const conMail = d.members.filter(m => m.email);
  const m = d.members.find(x => (x.email || '').toLowerCase() === yo.toLowerCase()) || d.members.find(x => x.owner) || d.members.find(x => x.role === 'admin');
  const estado = '<p style="font-size:13px;color:#5f5f6e">Conexión con la plataforma: ✅ · Personas en el equipo: <b>' + d.members.length + '</b> · Con email cargado: <b>' + conMail.length + '</b> · Tareas: <b>' + d.tasks.length + '</b></p>';
  if (!m) {
    enviar(yo, '✅ ANM · La conexión funciona', cuerpo('¡La conexión funciona! 🎉', estado + '<p>Todavía no hay perfiles cargados en la plataforma. Entrá, creá tu perfil y cargá al equipo; mañana a las ' + CONFIG.HORA_RESUMEN + ' h empiezan los resúmenes.</p>'));
    Logger.log('✅ Mail enviado (sin perfiles todavía).'); return;
  }
  const mail = armarResumen(m, d);
  const aviso = m.email ? '' : '<p style="font-size:13px;color:#b8860b">⚠️ Tu perfil (' + esc(m.name) + ') no tiene email cargado en la plataforma: cargalo en Equipo → Editar para recibir los resúmenes automáticos.</p>';
  enviar(yo, mail ? '[Prueba] ' + mail.asunto : '✅ ANM · La conexión funciona',
    mail ? mail.html.replace('<h2', aviso + estado + '<h2') : cuerpo('¡La conexión funciona! 🎉', estado + aviso + '<p>Hoy no tenés pendientes. 🎉</p>'));
  Logger.log('✅ Mail de prueba enviado a ' + yo);
}

// ── Lectura de datos (misma base que la plataforma) ─────────────────────────
function leer(id) {
  // Desde que hay login con Google, la base no responde a la clave pública: se usa la clave
  // de servidor guardada en las propiedades del script (nunca en el código).
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
  if (!key) throw new Error('Falta la propiedad SUPABASE_SERVICE_KEY (⚙ Configuración del proyecto → Propiedades de la secuencia de comandos).');
  const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/anm_state?id=eq.' + id + '&select=data', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('No pude leer ' + id + ': ' + r.getContentText());
  const rows = JSON.parse(r.getContentText());
  return (rows[0] && rows[0].data) || {};
}
const vivos = arr => (arr || []).filter(x => x && !x.deleted);
function datos() {
  const team = leer('team'), ops = leer('ops'), growth = leer('growth');
  return {
    members: vivos(team.members), notifications: vivos(team.notifications),
    tasks: vivos(ops.tasks), clients: vivos(ops.clients), meetings: vivos(ops.meetings), updates: vivos(ops.updates),
    leads: vivos(growth.leads),
  };
}

// ── Utilidades ──────────────────────────────────────────────────────────────
const hoy = () => Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyy-MM-dd');
function sumarDias(ymd, n) { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return Utilities.formatDate(d, CONFIG.ZONA, 'yyyy-MM-dd'); }
function diasEntre(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fecha(ymd) { const [y, m, d] = ymd.slice(0, 10).split('-'); return Number(d) + ' ' + MESES[Number(m) - 1]; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nombre = m => (m && (String(m.nick || '').trim() || (m.name || '').split(' ')[0])) || '';
const quiereMails = m => m.email && m.emailReminders !== false;

function cuerpo(titulo, contenido) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#18181c">' +
    '<div style="background:#101013;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0"><b style="color:#4d96ff;letter-spacing:3px;font-size:20px">ANM</b>' +
    '<span style="color:#9a9aab;font-size:11px;letter-spacing:2px;margin-left:8px">PLATAFORMA</span></div>' +
    '<div style="border:1px solid #e3e3e8;border-top:0;padding:22px 24px;border-radius:0 0 12px 12px;background:#fff">' +
    '<h2 style="margin:0 0 14px;font-size:19px">' + titulo + '</h2>' + contenido +
    '<p style="margin:26px 0 0"><a href="' + CONFIG.PLATAFORMA + '" style="background:#1A73E8;color:#fff;padding:11px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Abrir la plataforma</a></p>' +
    '<p style="color:#9a9aab;font-size:11px;margin-top:22px">Si no querés recibir estos mails, desactivalos en la plataforma: tocá tu nombre abajo a la izquierda → Editar mi perfil.</p></div></div>';
}
function bloque(titulo, color, items) {
  if (!items.length) return '';
  return '<h3 style="font-size:14px;margin:18px 0 6px;color:' + color + '">' + titulo + ' (' + items.length + ')</h3>' +
    '<ul style="margin:0;padding-left:18px;line-height:1.6;font-size:14px">' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
}
// Los caracteres especiales (acentos, emojis) se mandan como entidades HTML para que no se rompan
const entidades = h => Array.from(String(h)).map(c => c.codePointAt(0) > 127 ? '&#' + c.codePointAt(0) + ';' : c).join('');
function enviar(to, asunto, html) {
  html = entidades(html);
  GmailApp.sendEmail(to, asunto, 'Abrí este mail en un cliente que muestre HTML: ' + CONFIG.PLATAFORMA, { htmlBody: html, name: CONFIG.REMITENTE });
}

// ── Resumen diario ──────────────────────────────────────────────────────────
function armarResumen(m, d) {
  const t = hoy(), en3 = sumarDias(t, 3);
  const cliente = id => { const c = d.clients.find(x => x.id === id); return c ? c.name : 'Interna'; };
  const abiertas = d.tasks.filter(x => x.status !== 'done' && (x.assigneeId === m.id || (x.alsoIds || []).indexOf(m.id) >= 0));
  const venc = abiertas.filter(x => x.due && x.due < t).sort((a, b) => a.due.localeCompare(b.due));
  const deHoy = abiertas.filter(x => x.due === t);
  const prox = abiertas.filter(x => x.due > t && x.due <= en3).sort((a, b) => a.due.localeCompare(b.due));
  const reus = d.meetings.filter(x => x.date && x.date.slice(0, 10) === t && (x.attendees || []).includes(m.id));
  const seg = m.role === 'invitado' ? [] : d.leads.filter(l => l.ownerId === m.id && l.nextFollowUp && l.nextFollowUp <= t && ['objetivo', 'contactado', 'reunion', 'ppt', 'propuesta', 'negociacion'].includes(l.stage));
  const tarea = x => '<b>' + esc(x.title) + '</b> <span style="color:#5f5f6e">· ' + esc(cliente(x.clientId)) + (x.due ? ' · ' + fecha(x.due) : '') + (x.due && x.due < t ? ' (hace ' + diasEntre(x.due, t) + ' d)' : '') + '</span>';
  let html = '';
  html += bloque('⏰ Vencidas', '#e8484a', venc.map(tarea));
  html += bloque('📍 Para hoy', '#b8860b', deHoy.map(tarea));
  html += bloque('📅 Próximos 3 días', '#1A73E8', prox.map(tarea));
  html += bloque('🤝 Reuniones de hoy', '#9b6fe8', reus.map(x => '<b>' + esc(x.date.slice(11, 16)) + '</b> ' + esc(x.title) + ' <span style="color:#5f5f6e">· ' + esc(cliente(x.clientId)) + '</span>'));
  html += bloque('📞 Seguimientos comerciales', '#12a08c', seg.map(l => '<b>' + esc(l.company) + '</b> <span style="color:#5f5f6e">· ' + esc(l.nextAction || 'hacer seguimiento') + '</span>'));
  // Socios: foto del equipo
  if (m.role === 'admin') {
    const ultimo = {}; d.updates.forEach(u => { if (!ultimo[u.clientId] || u.at > ultimo[u.clientId]) ultimo[u.clientId] = u.at; });
    const quietos = d.clients.filter(c => c.active !== false).filter(c => !ultimo[c.id] || diasEntre(ultimo[c.id].slice(0, 10), t) > 7);
    const riesgo = d.clients.filter(c => c.active !== false && c.health === 'riesgo');
    const vencEq = d.tasks.filter(x => x.status !== 'done' && x.due && x.due < t && x.assigneeId !== m.id);
    const quien = id => { const p = d.members.find(x => x.id === id); return p ? nombre(p) : 'sin asignar'; };
    html += bloque('🔴 Clientes en riesgo', '#e8484a', riesgo.map(c => '<b>' + esc(c.name) + '</b>' + (c.status ? ' <span style="color:#5f5f6e">· ' + esc(c.status.slice(0, 120)) + '</span>' : '')));
    html += bloque('📡 Clientes sin actualizar hace +7 días', '#b8860b', quietos.map(c => esc(c.name)));
    html += bloque('👥 Tareas vencidas del equipo', '#5f5f6e', vencEq.slice(0, 15).map(x => '<b>' + esc(x.title) + '</b> <span style="color:#5f5f6e">· ' + esc(quien(x.assigneeId)) + ' · ' + fecha(x.due) + '</span>'));
  }
  if (!html) return null;
  const total = venc.length + deHoy.length + prox.length + reus.length + seg.length;
  const asunto = venc.length ? '⏰ ' + nombre(m) + ', tenés ' + venc.length + ' tarea' + (venc.length > 1 ? 's' : '') + ' vencida' + (venc.length > 1 ? 's' : '') + ' · ANM'
    : total ? '📋 ' + nombre(m) + ', tu día en ANM: ' + total + ' pendiente' + (total > 1 ? 's' : '') : '📊 Resumen del equipo · ANM';
  const intro = '<p style="margin:0 0 6px;font-size:14px">Hola ' + esc(nombre(m)) + ', esto es lo que tenés para hoy:</p>';
  return { asunto: asunto, html: cuerpo('Buen día ☀️', intro + html) };
}

function resumenDiario() {
  const dow = Number(Utilities.formatDate(new Date(), CONFIG.ZONA, 'u')); // 1=lun … 7=dom
  if (!CONFIG.RESUMEN_FINDE && dow >= 6) return;
  const d = datos();
  d.members.filter(quiereMails).forEach(m => {
    try { const mail = armarResumen(m, d); if (mail) enviar(m.email, mail.asunto, mail.html); }
    catch (e) { Logger.log('Error con ' + m.name + ': ' + e); }
  });
}

// ── Reporte de cierre del día (19 h, solo al dueño) ─────────────────────────
// Todas las tareas pendientes, agrupadas por empresa (con link para entrar directo al cliente).
// Cada tarea en grande; abajo, más chico, el responsable y los involucrados. Sin emojis.
function armarReporte(d) {
  const t = hoy(), byId = {}; d.members.forEach(m => byId[m.id] = m);
  const quien = id => byId[id] ? nombre(byId[id]) : 'Sin responsable';
  const SIN = 'Interno / sin cliente';
  const cli = id => d.clients.find(c => c.id === id);
  const ST = { todo: 'Pendiente', doing: 'En curso', review: 'En revisión' };
  const abiertas = d.tasks.filter(x => x.status !== 'done');
  const vencidas = abiertas.filter(x => x.due && x.due < t);
  // Resumen por persona (cuenta también a los involucrados)
  const porPersona = {};
  abiertas.forEach(x => { const ps = [x.assigneeId].concat(x.alsoIds || []).filter(Boolean); (ps.length ? ps : ['']).forEach(p => {
    const k = quien(p); porPersona[k] = porPersona[k] || { n: 0, v: 0 }; porPersona[k].n++; if (x.due && x.due < t) porPersona[k].v++; }); });
  const td = 'padding:5px 18px 5px 0;border-bottom:1px solid #f0f0f3';
  const resumen = '<table style="border-collapse:collapse;font-size:13px;margin:4px 0 6px">' +
    '<tr style="color:#5f5f6e"><td style="' + td + '"><b>Persona</b></td><td style="' + td + '"><b>Pendientes</b></td><td style="' + td + '"><b>Vencidas</b></td></tr>' +
    Object.keys(porPersona).sort().map(k => '<tr><td style="' + td + '">' + esc(k) + '</td><td style="' + td + '">' + porPersona[k].n + '</td><td style="' + td + ';color:' + (porPersona[k].v ? '#d93025;font-weight:bold' : '#9a9aab') + '">' + porPersona[k].v + '</td></tr>').join('') + '</table>';
  // Agrupar por empresa
  const grupos = {};
  abiertas.forEach(x => { const c = cli(x.clientId); const k = c ? c.id : ''; (grupos[k] = grupos[k] || { c: c, tareas: [] }).tareas.push(x); });
  const orden = Object.keys(grupos).sort((a, b) => (a === '') - (b === '') || (grupos[a].c.name || '').localeCompare(grupos[b].c.name || ''));
  const cuando = x => !x.due ? 'Sin fecha' : x.due < t ? '<b style="color:#d93025">Venció el ' + fecha(x.due) + '</b>' : x.due === t ? '<b style="color:#b06000">Vence hoy</b>' : 'Vence el ' + fecha(x.due);
  const tarea = x => {
    const inv = (x.alsoIds || []).filter(Boolean).map(quien);
    return '<div style="padding:10px 0;border-bottom:1px solid #f0f0f3">' +
      '<div style="font-size:16px;font-weight:bold;color:#18181c;line-height:1.35">' + esc(x.title) +
      (x.priority === 'alta' ? ' <span style="background:#fde8e7;color:#d93025;font-size:11px;padding:2px 7px;border-radius:9px;vertical-align:2px">URGENTE</span>' : '') + '</div>' +
      '<div style="font-size:12px;color:#5f5f6e;margin-top:3px">' + cuando(x) + ' &middot; ' + (ST[x.status || 'todo'] || 'Pendiente') +
      ' &middot; Responsable: <b style="color:#3c3c46">' + esc(quien(x.assigneeId)) + '</b>' +
      (inv.length ? ' &middot; Involucrados: ' + esc(inv.join(', ')) : '') + '</div></div>';
  };
  const detalle = orden.map(k => {
    const g = grupos[k], nombreE = g.c ? g.c.name : SIN;
    const link = g.c ? CONFIG.PLATAFORMA + '#/ops/cliente/' + g.c.id : '';
    return '<div style="margin:26px 0 0">' +
      '<table style="width:100%;border-collapse:collapse;border-bottom:2px solid #18181c"><tr>' +
      '<td style="font-size:17px;font-weight:bold;padding:0 0 6px">' + esc(nombreE) + ' <span style="color:#9a9aab;font-weight:normal;font-size:14px">(' + g.tareas.length + ')</span></td>' +
      (link ? '<td style="text-align:right;padding:0 0 6px;white-space:nowrap"><a href="' + link + '" style="color:#1A73E8;font-size:13px;font-weight:bold;text-decoration:none">Ver cliente &rarr;</a></td>' : '') +
      '</tr></table>' +
      g.tareas.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).map(tarea).join('') + '</div>';
  }).join('');
  const intro = '<p style="margin:0 0 10px;font-size:14px">Cierre del ' + fecha(t) + ': <b>' + abiertas.length + '</b> tareas pendientes' +
    (vencidas.length ? ', <b style="color:#d93025">' + vencidas.length + ' vencidas</b>' : '') + '.</p>';
  return { asunto: 'ANM - Tareas pendientes al cierre (' + fecha(t) + '): ' + abiertas.length + (vencidas.length ? ', ' + vencidas.length + ' vencidas' : ''),
    html: cuerpo('Reporte de cierre del día', intro + (abiertas.length ? resumen + detalle : '<p>No quedan tareas pendientes.</p>')) };
}
// El dueño (👑) de la plataforma; si no está cargado, quien ejecuta el script
function duenio(d) {
  const o = d.members.find(m => m.owner && m.email);
  return o ? o.email : (Session.getEffectiveUser().getEmail() || '');
}
function reporteCierre() {
  const d = datos(), para = duenio(d);
  if (!para) { Logger.log('No encontré el mail del dueño.'); return; }
  const mail = armarReporte(d);
  enviar(para, mail.asunto, mail.html);
}
function probarReporte() {
  const yo = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  const mail = armarReporte(datos());
  enviar(yo, '[Prueba] ' + mail.asunto, mail.html);
  Logger.log('Reporte de prueba enviado a ' + yo);
}

// ── Avisos nuevos (cada hora) ───────────────────────────────────────────────
function avisosNuevos() {
  const props = PropertiesService.getScriptProperties();
  const desde = props.getProperty('avisos_desde') || new Date(Date.now() - 36e5).toISOString();
  const d = datos();
  const nuevos = d.notifications.filter(n => n.at > desde).sort((a, b) => a.at.localeCompare(b.at));
  if (!nuevos.length) return;
  const de = id => { const p = d.members.find(x => x.id === id); return p ? p.name : 'La plataforma'; };
  d.members.filter(quiereMails).forEach(m => {
    const mios = nuevos.filter(n => (n.to === m.id || n.to === 'all') && n.from !== m.id && !(n.readBy || []).includes(m.id));
    if (!mios.length) return;
    const items = mios.map(n => esc(n.text).replace(/\n/g, '<br>') + ' <span style="color:#5f5f6e;font-size:12px">— ' + esc(de(n.from)) + '</span>' +
      (n.link ? ' · <a href="' + CONFIG.PLATAFORMA + n.link + '">ver</a>' : ''));
    const asunto = mios.length === 1 ? '🔔 ' + mios[0].text.split('\n')[0].slice(0, 90) : '🔔 ' + nombre(m) + ', tenés ' + mios.length + ' avisos nuevos en ANM';
    try { enviar(m.email, asunto, cuerpo('Novedades para vos', bloque('🔔 Avisos', '#1A73E8', items))); }
    catch (e) { Logger.log('Error con ' + m.name + ': ' + e); }
  });
  props.setProperty('avisos_desde', nuevos[nuevos.length - 1].at);
}
