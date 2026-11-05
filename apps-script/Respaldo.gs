/**
 * ANM · Respaldo diario automático (Google Apps Script, gratis)
 * ─────────────────────────────────────────────────────────────
 * Todos los días a la madrugada guarda en tu Google Drive (carpeta "ANM respaldos")
 * una copia de toda la plataforma y de Finanzas. Conserva los últimos 30 días.
 *
 * Los archivos se restauran desde la misma app:
 *   · ANM-plataforma-AAAA-MM-DD.json → Ajustes → "Restaurar respaldo"
 *   · ANM-finanzas-AAAA-MM-DD.json   → Finanzas → ⚙ → "Restaurar backup"
 *
 * Instalación (una sola vez, puede ir en el mismo proyecto de Recordatorios):
 *   1. En el proyecto de Apps Script: Archivos → ＋ → Secuencia de comandos → "Respaldo" → pegar TODO esto → 💾.
 *   2. ⚙ Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad:
 *        SUPABASE_SERVICE_KEY = la clave "secret" (o "service_role") de Supabase → Project Settings → API Keys.
 *      (Esta clave NUNCA va en el código de la página: solo acá, en tu Google.)
 *      Mientras no la cargues usa la clave pública, que sirve solo hasta activar el login (Fase 1).
 *   3. Elegí la función "instalarRespaldo" y ▶ Ejecutar (aceptá los permisos de Drive).
 *   4. Para probar ya: elegí "respaldarAhora" y ▶ Ejecutar → mirá la carpeta "ANM respaldos" en tu Drive.
 */

const RESPALDO = {
  SUPABASE_URL: 'https://pxsgqbldbdvbrfwqnvyl.supabase.co',
  CLAVE_PUBLICA: 'sb_publishable_raHPfxFnjqySQ1QyS75aCw_RywBnd0O',
  CARPETA: 'ANM respaldos',
  DIAS: 30,
  HORA: 4,
  ZONA: 'America/Argentina/Buenos_Aires',
};

function instalarRespaldo() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'respaldarAhora').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('respaldarAhora').timeBased().everyDays(1).atHour(RESPALDO.HORA).inTimezone(RESPALDO.ZONA).create();
  Logger.log('✅ Respaldo diario instalado (todos los días a las ' + RESPALDO.HORA + ' h).');
}

function respaldarAhora() {
  const clave = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY') || RESPALDO.CLAVE_PUBLICA;
  const res = UrlFetchApp.fetch(RESPALDO.SUPABASE_URL + '/rest/v1/anm_state?select=id,data,updated_at', {
    headers: { apikey: clave, Authorization: 'Bearer ' + clave }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('No pude leer la base (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  const filas = JSON.parse(res.getContentText()), por = {};
  filas.forEach(f => por[f.id] = f.data);
  if (!por.team && !por.ops) throw new Error('La base respondió vacía: revisá la clave SUPABASE_SERVICE_KEY.');

  const hoy = Utilities.formatDate(new Date(), RESPALDO.ZONA, 'yyyy-MM-dd');
  const carpeta = obtenerCarpeta();
  const guardar = (nombre, data) => {
    carpeta.getFilesByName(nombre).hasNext() && carpeta.getFilesByName(nombre).next().setTrashed(true);
    carpeta.createFile(nombre, JSON.stringify(data), 'application/json');
  };
  guardar('ANM-plataforma-' + hoy + '.json', { ops: por.ops || {}, growth: por.growth || {}, team: por.team || {} });
  if (por.main) guardar('ANM-finanzas-' + hoy + '.json', por.main);

  // Borrar los de más de 30 días
  const limite = Date.now() - RESPALDO.DIAS * 864e5, it = carpeta.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^ANM-/.test(f.getName()) && f.getDateCreated().getTime() < limite) f.setTrashed(true); }
  Logger.log('✅ Respaldo del ' + hoy + ' guardado en Drive › ' + RESPALDO.CARPETA);
}

function obtenerCarpeta() {
  const it = DriveApp.getFoldersByName(RESPALDO.CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(RESPALDO.CARPETA);
}
