/**
 * ANM · IA para ordenar reuniones (Google Apps Script)
 * ─────────────────────────────────────────────────────
 * Hace de puente entre la plataforma y la API de Claude, así la clave de la API
 * queda guardada en tu Google y nunca en el código de la página.
 *
 * Instalación (una sola vez, en el MISMO proyecto de Recordatorios):
 *   1. En https://console.anthropic.com → API Keys → creá una clave (empieza con "sk-ant-").
 *      La API se paga aparte por uso (ordenar una reunión cuesta unos pocos centavos de dólar).
 *   2. En el proyecto de Apps Script: Archivos → ＋ → Secuencia de comandos → llamalo "IA"
 *      y pegá TODO este archivo. Guardá (💾).
 *   3. ⚙ Configuración del proyecto → abajo de todo "Propiedades de la secuencia de comandos" →
 *      Agregar propiedad:
 *         ANTHROPIC_API_KEY = tu clave sk-ant-…
 *         CLAVE_ANM         = una palabra secreta inventada (ej: piletaazul47)
 *   4. Elegí la función "probarIA" y ▶ Ejecutar → en el registro tiene que decir "✅ La IA responde".
 *   5. Implementar → Nueva implementación → ⚙ tipo "Aplicación web":
 *         Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier usuario
 *      → Implementar → copiá la URL que termina en /exec.
 *   6. En la plataforma: Ajustes → 🧠 IA para ordenar reuniones → Configurar → pegá la URL y la CLAVE_ANM.
 * Si después cambiás este archivo: Implementar → Gestionar implementaciones → ✎ → Versión: nueva.
 */

const IA = {
  MODELO: 'claude-sonnet-5-5',
  MAX_TOKENS: 8000,
};

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const clave = props.getProperty('CLAVE_ANM');
    if (clave && body.token !== clave) return salida({ ok: false, error: 'Clave ANM incorrecta (revisala en Ajustes de la plataforma)' });
    if (!body.prompt) return salida({ ok: false, error: 'Falta el texto' });
    return salida({ ok: true, text: preguntar(body.prompt) });
  } catch (err) {
    return salida({ ok: false, error: String(err.message || err) });
  }
}

function doGet() { return salida({ ok: true, text: 'ANM IA funcionando' }); }

function preguntar(prompt) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY en las propiedades del script');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: IA.MODELO, max_tokens: IA.MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
    muteHttpExceptions: true,
  });
  const j = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('API de Claude: ' + ((j.error && j.error.message) || res.getResponseCode()));
  return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function probarIA() {
  const r = preguntar('Respondé solo: ✅ La IA responde');
  Logger.log(r);
}
