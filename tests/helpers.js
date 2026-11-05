// Base de datos simulada en memoria: responde como Supabase a la tabla anm_state.
const path = require('path');
async function mockSupabase(page, seed = {}) {
  const DB = JSON.parse(JSON.stringify(seed));
  await page.route('**/*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (url.pathname.endsWith('/anm_errors')) return route.fulfill({ status: 201, body: '' });
    const id = (url.searchParams.get('id') || '').replace('eq.', '');
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id && DB[id] ? [{ data: DB[id] }] : []) });
    const body = JSON.parse(req.postData() || '{}');
    if (m === 'POST') { DB[body.id] = body.data; return route.fulfill({ status: 201, body: '' }); }
    if (m === 'PATCH') { if (DB[id]) DB[id] = body.data; return route.fulfill({ status: DB[id] ? 204 : 404, body: '' }); }
    return route.fulfill({ status: 405, body: '' });
  });
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.route('**/fonts.gstatic.com/**', r => r.abort());
  await page.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart=function(){return{destroy(){}}};' }));
  return DB;
}
// Entra creando el primer socio (base vacía)
async function entrar(page) {
  await page.goto('/');
  await page.fill('#g-name', 'Prueba Socio');
  await page.fill('#g-p1', 'clave1234');
  await page.fill('#g-p2', 'clave1234');
  await page.click('text=Empezar');
  await page.waitForSelector('.hero');
}
module.exports = { mockSupabase, entrar };
