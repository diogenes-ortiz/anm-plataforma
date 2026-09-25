// ─── STORE ────────────────────────────────────────────────────────────────────
// Guarda cada sección como un documento JSON en la tabla `anm_state` de Supabase
// (la misma que ya usa Finanzas, con ids 'ops', 'growth' y 'team').
// Cada documento tiene colecciones de registros { id, updatedAt, deleted? }.
// Al guardar, primero traemos la versión remota y fusionamos registro por registro
// (gana el updatedAt más nuevo). Así dos personas editando a la vez no se pisan.
(function(){
  const { SUPABASE_URL:SB_URL, SUPABASE_KEY:SB_KEY } = window.ANM_CONFIG;
  const HEADERS = { 'Content-Type':'application/json', apikey:SB_KEY, Authorization:'Bearer '+SB_KEY };
  const DOCS = ['ops','growth','team'];
  const LS = id => 'anm_doc_'+id;
  const TOMBSTONE_DAYS = 60;

  const docs = {};           // id -> { col: [records] }
  const dirty = new Set();
  let saveTimer = null, pollTimer = null, status = 'local';
  const listeners = [];

  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
  function now(){ return new Date().toISOString(); }

  function setStatus(s){ status=s; listeners.forEach(fn=>fn({type:'status',status:s})); }
  function emit(){ listeners.forEach(fn=>fn({type:'change'})); }

  // Fusiona dos documentos: por colección, por id, gana el más reciente.
  function mergeDocs(a, b){
    const out = {};
    const keys = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
    const cutoff = Date.now() - TOMBSTONE_DAYS*864e5;
    keys.forEach(k=>{
      const A = a?.[k], B = b?.[k];
      if(!Array.isArray(A) && !Array.isArray(B)){ out[k] = B!==undefined ? B : A; return; }
      const map = new Map();
      [...(A||[]), ...(B||[])].forEach(r=>{
        if(!r || r.id==null) return;
        const prev = map.get(r.id);
        if(!prev || (r.updatedAt||'') > (prev.updatedAt||'')) map.set(r.id, r);
      });
      out[k] = [...map.values()].filter(r=>!(r.deleted && Date.parse(r.updatedAt||0) < cutoff));
    });
    return out;
  }

  // Firma estable (Postgres jsonb reordena claves, así que ordenamos antes de comparar)
  function sig(v){
    if(Array.isArray(v)) return '['+v.map(sig).join(',')+']';
    if(v && typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+sig(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }

  async function fetchRemote(id){
    const res = await fetch(`${SB_URL}/rest/v1/anm_state?id=eq.${id}&select=data`, { headers:HEADERS });
    if(!res.ok) throw new Error('fetch '+res.status);
    const rows = await res.json();
    return rows.length ? (rows[0].data||{}) : null;
  }

  async function pushRemote(id, data){
    const body = JSON.stringify({ id, data, updated_at:now() });
    const res = await fetch(`${SB_URL}/rest/v1/anm_state`, {
      method:'POST', headers:{ ...HEADERS, Prefer:'resolution=merge-duplicates,return=minimal' }, body
    });
    if(res.ok) return;
    // Fallback igual al de Finanzas: PATCH sobre la fila existente
    const res2 = await fetch(`${SB_URL}/rest/v1/anm_state?id=eq.${id}`, {
      method:'PATCH', headers:{ ...HEADERS, Prefer:'return=minimal' }, body:JSON.stringify({ data, updated_at:now() })
    });
    if(!res2.ok) throw new Error('push '+res2.status);
  }

  function persistLocal(id){ try{ localStorage.setItem(LS(id), JSON.stringify(docs[id])); }catch(e){} }

  async function syncDoc(id, push){
    const remote = await fetchRemote(id);
    const before = sig(docs[id]);
    const merged = mergeDocs(remote||{}, docs[id]);
    docs[id] = merged;
    persistLocal(id);
    if(push || sig(remote||{})!==sig(merged)) await pushRemote(id, merged);
    return before !== sig(merged);
  }

  async function flush(){
    if(!dirty.size) return;
    const ids = [...dirty]; dirty.clear();
    setStatus('syncing');
    try{
      for(const id of ids) await syncDoc(id, true);
      setStatus('synced');
    }catch(e){ ids.forEach(i=>dirty.add(i)); setStatus('error'); }
  }

  async function pull(){
    if(dirty.size) return flush();
    try{
      let changed = false;
      for(const id of DOCS){ if(await syncDoc(id, false)) changed = true; }
      setStatus('synced');
      if(changed) emit();
    }catch(e){ setStatus('error'); }
  }

  const Store = {
    uid, now,
    get status(){ return status; },
    on(fn){ listeners.push(fn); },

    loadLocal(){
      DOCS.forEach(id=>{
        try{ docs[id] = JSON.parse(localStorage.getItem(LS(id))||'{}'); }catch(e){ docs[id] = {}; }
      });
    },

    async init(){
      this.loadLocal();
      setStatus('syncing');
      await pull();
      clearInterval(pollTimer);
      pollTimer = setInterval(()=>{ if(!document.hidden) pull(); }, 20000);
      document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) pull(); });
      window.addEventListener('beforeunload', ()=>{ if(dirty.size) flush(); });
    },

    // Lectura: registros vivos de una colección
    all(doc, col){ return (docs[doc]?.[col]||[]).filter(r=>!r.deleted); },
    get(doc, col, id){ return (docs[doc]?.[col]||[]).find(r=>r.id===id && !r.deleted); },

    upsert(doc, col, rec){
      if(!docs[doc]) docs[doc] = {};
      if(!docs[doc][col]) docs[doc][col] = [];
      const arr = docs[doc][col];
      const r = { ...rec, id:rec.id||uid(), updatedAt:now() };
      if(!r.createdAt) r.createdAt = r.updatedAt;
      const i = arr.findIndex(x=>x.id===r.id);
      if(i>=0) arr[i] = { ...arr[i], ...r }; else arr.push(r);
      this.touch(doc);
      return i>=0 ? arr[i] : r;
    },

    remove(doc, col, id){
      const arr = docs[doc]?.[col]||[];
      const r = arr.find(x=>x.id===id);
      if(r){ r.deleted = true; r.updatedAt = now(); this.touch(doc); }
    },

    // Registro único (ej: ajustes) guardado dentro de una colección
    setting(key, fallback){ return this.get('team','settings',key)?.value ?? fallback; },
    setSetting(key, value){ this.upsert('team','settings',{ id:key, value }); },

    touch(doc){
      persistLocal(doc); dirty.add(doc); emit();
      clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900);
    },

    // Finanzas (documento 'main') — solo lectura de nombres para importar clientes
    async readFinance(){ try{ return await fetchRemote('main'); }catch(e){ return null; } },

    exportAll(){ return JSON.parse(JSON.stringify(docs)); },
    importAll(data){
      DOCS.forEach(id=>{ if(data[id]){ docs[id] = mergeDocs(docs[id], data[id]); this.touch(id); } });
    },
    syncNow(){ return dirty.size ? flush() : pull(); },
  };

  window.Store = Store;
})();
