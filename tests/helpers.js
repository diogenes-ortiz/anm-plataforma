// Base de datos simulada en memoria: responde como Supabase (anm_state, anm_access y Auth).
// Aplica las mismas reglas de permisos que supabase/fase1-seguridad.sql.
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (email, name='Prueba Socio') => `${b64({ alg:'none' })}.${b64({ email, exp: Math.floor(Date.now()/1000)+3600, user_metadata:{ full_name:name } })}.x`;

async function mockSupabase(page, { seed = {}, access = [{ email:'socio@gmail.com', role:'owner' }] } = {}) {
  const DB = JSON.parse(JSON.stringify(seed)), ACC = JSON.parse(JSON.stringify(access)), AT = {}; let seq = 0;
  Object.keys(DB).forEach(k => AT[k] = '2026-01-01T00:00:00.000Z');
  const roleOf = req => { const t = (req.headers()['authorization']||'').replace('Bearer ',''); try{ const e = JSON.parse(Buffer.from(t.split('.')[1],'base64url')).email; return ACC.find(a=>a.email===e)?.role || null; }catch(e){ return null; } };
  const puede = (id, r) => id==='main' ? ['owner','socio'].includes(r) : id==='growth' ? ['owner','socio','equipo'].includes(r) : ['ops','team'].includes(id) && !!r;
  await page.route('**/*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method(), role = roleOf(req);
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 200, contentType:'application/json', body: '{}' });
    if (url.pathname.endsWith('/anm_errors')) return route.fulfill({ status: role ? 201 : 401, body: '' });
    if (url.pathname.endsWith('/anm_access')) {
      const email = (url.searchParams.get('email')||'').replace('eq.','');
      if (m === 'GET') return route.fulfill({ status: 200, contentType:'application/json', body: JSON.stringify(role==='owner' && !email ? ACC : ACC.filter(a=>a.email===email)) });
      if (role !== 'owner') return route.fulfill({ status: 403, body: '' });
      if (m === 'POST') { const b = JSON.parse(req.postData()); const i = ACC.findIndex(a=>a.email===b.email); i>=0 ? ACC[i] = { ...ACC[i], ...b } : ACC.push(b); return route.fulfill({ status: 201, body: '' }); }
      if (m === 'DELETE') { const i = ACC.findIndex(a=>a.email===email && a.role!=='owner'); if(i>=0) ACC.splice(i,1); return route.fulfill({ status: 204, body: '' }); }
    }
    const id = (url.searchParams.get('id') || '').replace('eq.', '');
    if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id && DB[id] && puede(id, role) ? [{ data: DB[id], updated_at: AT[id] }] : []) });
    const body = JSON.parse(req.postData() || '{}'), target = body.id || id;
    if (!puede(target, role)) return route.fulfill({ status: 403, body: '' });
    const stamp = () => new Date(Date.now() + (++seq)).toISOString();
    if (m === 'POST') { if (DB[body.id]) return route.fulfill({ status: 409, body: '' }); DB[body.id] = body.data; AT[body.id] = stamp(); return route.fulfill({ status: 201, body: '' }); }
    if (m === 'PATCH') {
      const cond = url.searchParams.get('updated_at');
      if (!DB[id] || (cond && cond.replace('eq.', '') !== AT[id])) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      DB[id] = body.data; AT[id] = stamp();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id }]) });
    }
    return route.fulfill({ status: 405, body: '' });
  });
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.route('**/fonts.gstatic.com/**', r => r.abort());
  await page.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Chart=function(){return{destroy(){}}};' }));
  return { DB, ACC };
}
// Simula haber entrado con Google con ese mail
async function sesion(page, email = 'socio@gmail.com', name = 'Prueba Socio') {
  await page.addInitScript(([email, tok, name]) => {
    if (!localStorage.getItem('anm_auth')) localStorage.setItem('anm_auth', JSON.stringify({ access_token: tok, refresh_token: 'r', expires_at: Date.now()+3600e3, email, name, lastSeen: Date.now() }));
  }, [email, fakeJwt(email, name), name]);
}
async function entrar(page, email) {
  await sesion(page, email);
  await page.goto('/');
  await page.waitForSelector('.hero');
}
module.exports = { mockSupabase, sesion, entrar, fakeJwt };
