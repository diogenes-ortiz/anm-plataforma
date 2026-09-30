/**
 * ANM · Recordatorios por mail (Google Apps Script)
 * ─────────────────────────────────────────────────
 * Manda mails desde TU Gmail a cada persona del equipo:
 *   • resumenDiario()  → todos los días a la mañana: tareas vencidas, de hoy y próximas,
 *                        reuniones del día y seguimientos del CRM. A los socios, además,
 *                        un resumen del equipo (clientes sin actualizar, tareas vencidas).
 *   • avisosNuevos()   → cada hora: los avisos nuevos de la plataforma (tareas asignadas,
 *                        alertas mandadas con "Avisar", clientes en riesgo, nuevos clientes…).
 *
 * Instalación (una sola vez):
 *   1. Entrá a https://script.google.com con la cuenta de Gmail que va a mandar los mails → "Nuevo proyecto".
 *   2. Borrá lo que aparece y pegá TODO este archivo. Guardá (💾).
 *   3. ⚙ Configuración del proyecto → Zona horaria: "(GMT-03:00) Buenos Aires".
 *   4. Arriba elegí la función "instalar" y tocá ▶ Ejecutar. Aceptá los permisos que pide Google
 *      (leer datos externos y enviar mails como vos).
 *   5. Para probar: elegí "probarConmigo" y ▶ Ejecutar → te llega un resumen de ejemplo.
 * Cada persona necesita tener su email cargado en la plataforma (Equipo → Editar).
 */

const CONFIG = {
  SUPABASE_URL: 'https://pxsgqbldbdvbrfwqnvyl.supabase.co',
  SUPABASE_KEY: 'sb_publishable_raHPfxFnjqySQ1QyS75aCw_RywBnd0O',
  PLATAFORMA: 'https://diogenes-ortiz.github.io/anm-plataforma/',
  HORA_RESUMEN: 8,              // hora del resumen diario (0-23)
  RESUMEN_FINDE: false,         // true = también sábados y domingos
  ZONA: 'America/Argentina/Buenos_Aires',
  REMITENTE: 'ANM Plataforma',  // nombre que aparece como remitente
};

// ── Instalación ─────────────────────────────────────────────────────────────
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('resumenDiario').timeBased().everyDays(1).atHour(CONFIG.HORA_RESUMEN).inTimezone(CONFIG.ZONA).create();
  ScriptApp.newTrigger('avisosNuevos').timeBased().everyHours(1).create();
  // No reenviar avisos viejos: arrancamos desde ahora
  PropertiesService.getScriptProperties().setProperty('avisos_desde', new Date().toISOString());
  Logger.log('✅ Listo: resumen diario a las ' + CONFIG.HORA_RESUMEN + ' h y avisos cada hora.');
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Recordatorios desactivados.');
}

// Manda el resumen de hoy solo a la cuenta que ejecuta el script (para probar)
function probarConmigo() {
  const yo = Session.getActiveUser().getEmail();
  const d = datos();
  const m = d.members.find(x => (x.email || '').toLowerCase() === yo.toLowerCase()) || d.members.find(x => x.role === 'admin');
  if (!m) throw new Error('No encontré tu perfil. Cargá tu email en la plataforma (Equipo → Editar).');
  const mail = armarResumen(m, d);
  enviar(yo, mail ? mail.asunto : 'ANM · Prueba de recordatorios', mail ? mail.html : cuerpo('¡Hola ' + nombre(m) + '!', '<p>La conexión funciona. Hoy no tenés pendientes. 🎉</p>'));
  Logger.log('Mail de prueba enviado a ' + yo);
}

// ── Lectura de datos (misma base que la plataforma) ─────────────────────────
function leer(id) {
  const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/anm_state?id=eq.' + id + '&select=data', {
    headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY }, muteHttpExceptions: true,
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
const nombre = m => (m.name || '').split(' ')[0];
const quiereMails = m => m.email && m.emailReminders !== false;

function cuerpo(titulo, contenido) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#18181c">' +
    '<div style="background:#101013;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0"><b style="color:#4d96ff;letter-spacing:3px;font-size:20px">ANM</b>' +
    '<span style="color:#9a9aab;font-size:11px;letter-spacing:2px;margin-left:8px">PLATAFORMA</span></div>' +
    '<div style="border:1px solid #e3e3e8;border-top:0;padding:22px 24px;border-radius:0 0 12px 12px;background:#fff">' +
    '<h2 style="margin:0 0 14px;font-size:19px">' + titulo + '</h2>' + contenido +
    '<p style="margin:26px 0 0"><a href="' + CONFIG.PLATAFORMA + '" style="background:#1A73E8;color:#fff;padding:11px 20px;border-radius:9px;text-decoration:none;font-weight:bold">Abrir la plataforma</a></p>' +
    '<p style="color:#9a9aab;font-size:11px;margin-top:22px">Si no querés recibir estos mails, desactivalos en la plataforma: Ajustes → Mi perfil.</p></div></div>';
}
function bloque(titulo, color, items) {
  if (!items.length) return '';
  return '<h3 style="font-size:14px;margin:18px 0 6px;color:' + color + '">' + titulo + ' (' + items.length + ')</h3>' +
    '<ul style="margin:0;padding-left:18px;line-height:1.6;font-size:14px">' + items.map(i => '<li>' + i + '</li>').join('') + '</ul>';
}
function enviar(to, asunto, html) {
  GmailApp.sendEmail(to, asunto, 'Abrí este mail en un cliente que muestre HTML: ' + CONFIG.PLATAFORMA, { htmlBody: html, name: CONFIG.REMITENTE });
}

// ── Resumen diario ──────────────────────────────────────────────────────────
function armarResumen(m, d) {
  const t = hoy(), en3 = sumarDias(t, 3);
  const cliente = id => { const c = d.clients.find(x => x.id === id); return c ? c.name : 'Interna'; };
  const abiertas = d.tasks.filter(x => x.status !== 'done' && x.assigneeId === m.id);
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
