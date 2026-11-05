// ─── AUTH: entrar con Google (Supabase Auth) ──────────────────────────────────
// Cada persona entra con su cuenta de Google. Solo pueden entrar los mails que el
// dueño autorizó (tabla anm_access, que solo el dueño puede modificar). La base
// rechaza cualquier lectura o escritura sin una sesión válida.
(function(){
  const { SUPABASE_URL:SB_URL, SUPABASE_KEY:SB_KEY, LS_PREFIX } = window.ANM_CONFIG;
  const KEY = (LS_PREFIX||'') + 'anm_auth';
  const IDLE_DAYS = 14;                       // sin usar la app 14 días → hay que volver a entrar
  let session = null, access = null, refreshing = null;

  const load = () => { try{ session = JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ session = null; } };
  const persist = () => { try{ session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); }catch(e){} };
  const b64 = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/')))));
  const claims = t => { try{ return b64(t.split('.')[1]); }catch(e){ return {}; } };
  function setFrom(tokens){
    const c = claims(tokens.access_token);
    session = { access_token:tokens.access_token, refresh_token:tokens.refresh_token,
      expires_at: c.exp ? c.exp*1000 : Date.now() + (+tokens.expires_in||3600)*1000,
      email: String(c.email||'').toLowerCase(), name: c.user_metadata?.full_name || c.user_metadata?.name || '',
      avatar: c.user_metadata?.avatar_url || '', lastSeen: Date.now() };
    persist();
  }

  // Vuelta de Google: los tokens llegan en el # de la dirección
  function handleRedirect(){
    const h = location.hash;
    if(/access_token=/.test(h)){
      const p = new URLSearchParams(h.slice(1));
      setFrom({ access_token:p.get('access_token'), refresh_token:p.get('refresh_token'), expires_in:p.get('expires_in') });
      let back = '#/inicio'; try{ back = sessionStorage.getItem('anm_auth_back') || back; sessionStorage.removeItem('anm_auth_back'); }catch(e){}
      history.replaceState(null, '', location.pathname + location.search.replace(/[?&]entorno=[^&]*/,'') + back);
    } else if(/error_description=/.test(h)){
      const p = new URLSearchParams(h.slice(1));
      Auth.lastError = p.get('error_description');
      history.replaceState(null, '', location.pathname + '#/inicio');
    }
  }

  async function refresh(){
    if(!session?.refresh_token) return false;
    if(refreshing) return refreshing;
    refreshing = (async()=>{
      try{
        const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:session.refresh_token }) });
        if(r.status===400 || r.status===401){ session = null; persist(); return false; }   // sesión revocada
        if(!r.ok) return false;                                                               // sin red: se reintenta después
        const j = await r.json(); const keep = session.lastSeen; setFrom(j); session.lastSeen = keep; persist(); return true;
      }catch(e){ return false; }
      finally{ refreshing = null; }
    })();
    return refreshing;
  }

  const Auth = {
    lastError: '',
    get session(){ return session; },
    get email(){ return session?.email || ''; },
    get access(){ return access; },               // { email, role, member_id } o null si no está autorizado
    loggedIn(){ return !!session?.access_token; },

    login(){
      try{ sessionStorage.setItem('anm_auth_back', location.hash && !/access_token/.test(location.hash) ? location.hash : '#/inicio'); }catch(e){}
      const back = location.origin + location.pathname;
      location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}&prompt=select_account`;
    },
    async logout(){
      const t = session?.access_token; session = null; access = null; persist();
      try{ if(t) await fetch(`${SB_URL}/auth/v1/logout`, { method:'POST', headers:{ apikey:SB_KEY, Authorization:'Bearer '+t } }); }catch(e){}
    },
    // Token vigente (se renueva solo un minuto antes de vencer)
    async token(){
      if(!session) return null;
      if(Date.now() > session.expires_at - 60000) await refresh();
      return session?.access_token || null;
    },
    async headers(extra){
      const t = await this.token();
      return { 'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+(t||SB_KEY), ...(extra||{}) };
    },
    touch(){ if(session && Date.now() - (session.lastSeen||0) > 60000){ session.lastSeen = Date.now(); persist(); } },

    // ¿Este mail está autorizado? Lee su fila de anm_access (la base solo deja ver la propia, salvo al dueño)
    async check(){
      if(!session) return null;
      if(Date.now() - (session.lastSeen||0) > IDLE_DAYS*864e5){ await this.logout(); this.lastError = 'La sesión venció por falta de uso. Volvé a entrar.'; return null; }
      this.touch();
      try{
        const r = await fetch(`${SB_URL}/rest/v1/anm_access?email=eq.${encodeURIComponent(session.email)}&select=email,role,member_id`, { headers:await this.headers() });
        if(r.status===401){ if(await refresh()) return this.check(); session = null; persist(); return null; }
        if(!r.ok) throw new Error('acceso '+r.status);
        const rows = await r.json(); access = rows[0] || null;
        try{ localStorage.setItem(KEY+'_access', JSON.stringify(access)); }catch(e){}
        return access;
      }catch(e){
        // Sin conexión: se usa el último acceso conocido de este navegador
        try{ access = JSON.parse(localStorage.getItem(KEY+'_access')||'null'); }catch(_){ access = null; }
        if(access && access.email!==session.email) access = null;
        return access;
      }
    },

    // ── Solo el dueño: lista de Gmails autorizados ──
    async listAccess(){
      const r = await fetch(`${SB_URL}/rest/v1/anm_access?select=email,role,member_id,added_at&order=added_at.asc`, { headers:await this.headers() });
      if(!r.ok) throw new Error('No se pudo leer la lista ('+r.status+')'); return r.json();
    },
    async saveAccess(row){
      const r = await fetch(`${SB_URL}/rest/v1/anm_access?on_conflict=email`, { method:'POST', headers:await this.headers({ Prefer:'resolution=merge-duplicates,return=minimal' }),
        body:JSON.stringify({ email:String(row.email).trim().toLowerCase(), role:row.role, member_id:row.member_id||null }) });
      if(!r.ok) throw new Error((await r.text()).slice(0,200) || ('Error '+r.status));
    },
    async removeAccess(email){
      const r = await fetch(`${SB_URL}/rest/v1/anm_access?email=eq.${encodeURIComponent(email)}`, { method:'DELETE', headers:await this.headers({ Prefer:'return=minimal' }) });
      if(!r.ok) throw new Error('No se pudo quitar ('+r.status+')');
    },
  };
  load(); handleRedirect();
  ['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev, ()=>Auth.touch(), { passive:true }));
  window.Auth = Auth;
})();
