// ─── UI HELPERS ───────────────────────────────────────────────────────────────
(function(){
  const $ = (s,el=document)=>el.querySelector(s);
  const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const COLORS = ['#1A73E8','#2dca72','#e8b84a','#9b6fe8','#2dcab4','#e8854a','#e8484a','#4d96ff'];

  // Fechas en formato local YYYY-MM-DD (sin corrimientos de zona horaria)
  const pad = n => String(n).padStart(2,'0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  // Día LOCAL de una marca de tiempo ISO (BUG-15): "2026-11-06T01:30Z" en Argentina es el 5/11, no el 6
  const day = iso => { if(!iso) return ''; const v = String(iso); if(v.length<=10) return v; const d = new Date(v); return isNaN(d) ? v.slice(0,10) : ymd(d); };
  const parse = s => { if(!s) return null; const [y,m,d] = s.slice(0,10).split('-').map(Number); return new Date(y,m-1,d||1); };
  const addDays = (s,n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
  const diffDays = (a,b=today()) => Math.round((parse(b)-parse(a))/864e5);   // b - a
  const ym = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  const ymLabel = s => { const [y,m] = s.split('-'); return MONTHS[+m-1]+' '+y; };
  function fdate(s, opts={}){
    if(!s) return '—';
    const d = parse(s), dd = diffDays(ymd(new Date()), s.slice(0,10));
    if(!opts.abs){
      if(dd===0) return 'Hoy'; if(dd===1) return 'Mañana'; if(dd===-1) return 'Ayer';
      if(dd>1 && dd<7) return DAYS[d.getDay()]+' '+d.getDate();
    }
    return d.getDate()+' '+MONTHS[d.getMonth()].slice(0,3).toLowerCase()+(d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():'');
  }
  function ago(iso){
    if(!iso) return 'nunca';
    const m = Math.round((Date.now()-Date.parse(iso))/6e4);
    if(m<1) return 'recién'; if(m<60) return `hace ${m} min`;
    const h = Math.round(m/60); if(h<24) return `hace ${h} h`;
    const d = Math.round(h/24); if(d<30) return `hace ${d} día${d>1?'s':''}`;
    return fdate(iso.slice(0,10),{abs:true});
  }
  const time = iso => iso && iso.length>10 ? iso.slice(11,16) : '';
  const initials = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

  // Seguridad: solo links http(s), mailto y tel (bloquea javascript: y similares); colores solo #hex
  const safeUrl = u => { const v = String(u||'').trim(); if(!v) return ''; if(/^(https?:|mailto:|tel:)/i.test(v)) return v; if(/^#\//.test(v)) return v; if(/^[a-z][a-z0-9+.-]*:/i.test(v)) return ''; return 'https://'+v.replace(/^\/+/,''); };
  const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c||'')) ? c : COLORS[0];
  const safeId = v => String(v??'').replace(/[^A-Za-z0-9_-]/g,'');
  function avatar(m, cls=''){
    if(!m) return `<span class="av ${cls}" style="background:var(--surface3);color:var(--text3)">?</span>`;
    return `<span class="av ${cls}" title="${esc(m.name)}" style="background:${safeColor(m.color)}">${esc(initials(m.name))}</span>`;
  }

  // ── Modal genérico con formulario ─────────────────────────────────────────
  // fields: [{k,label,type:'text|textarea|select|multi|date|datetime|number|email|color|check',options:[[v,l]],req,hint,full,placeholder}]
  function form({title, fields, values={}, submit='Guardar', onSubmit, danger, wide, extra=''}){
    const v = values;
    const field = f=>{
      const id = 'f_'+f.k, val = v[f.k] ?? f.default ?? '';
      let input;
      if(f.type==='textarea') input = `<textarea class="inp" id="${id}" placeholder="${esc(f.placeholder||'')}" rows="${f.rows||4}">${esc(val)}</textarea>`;
      else if(f.type==='select') input = `<select class="inp" id="${id}">${(f.options||[]).map(([ov,ol])=>`<option value="${esc(ov)}" ${String(ov)===String(val)?'selected':''}>${esc(ol)}</option>`).join('')}</select>`;
      else if(f.type==='multi') input = `<div class="chips" id="${id}">${(f.options||[]).map(([ov,ol])=>`<button type="button" class="chip ${(val||[]).includes(ov)?'on':''}" data-v="${esc(ov)}" onclick="this.classList.toggle('on')">${esc(ol)}</button>`).join('')}</div>`;
      else if(f.type==='check') input = `<label class="check"><input type="checkbox" id="${id}" ${val?'checked':''}> ${esc(f.text||'')}</label>`;
      else if(f.type==='html') input = f.html;
      else input = `<input class="inp" id="${id}" type="${f.type==='datetime'?'datetime-local':(f.type||'text')}" value="${esc(val)}" placeholder="${esc(f.placeholder||'')}" ${f.type==='number'?'step="any"':''}>`;
      return `<div class="fld" ${f.full?'style="grid-column:1/-1"':''}><label for="${id}">${esc(f.label)}${f.req?' *':''}</label>${input}${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}</div>`;
    };
    // Agrupa campos marcados con half:true de a dos
    let html = '', buf = [];
    const flushBuf = ()=>{ if(buf.length){ html += `<div class="frow">${buf.join('')}</div>`; buf=[]; } };
    fields.forEach(f=>{ if(f.half){ buf.push(field(f)); if(buf.length===2) flushBuf(); } else { flushBuf(); html += field(f); } });
    flushBuf();
    const box = modal(`<h2>${esc(title)}<button class="icon-btn x" data-close>✕</button></h2>
      <form id="mform">${html}${extra}
      <div class="mfoot">${danger?`<button type="button" class="btn d" id="mdanger" style="margin-right:auto">${esc(danger.label)}</button>`:''}
      <button type="button" class="btn g" data-close>Cancelar</button><button class="btn p" type="submit">${esc(submit)}</button></div></form>`, wide);
    box.querySelector('#mform').addEventListener('submit', e=>{
      e.preventDefault();
      const out = {};
      for(const f of fields){
        const el = box.querySelector('#f_'+f.k); if(!el) continue;
        if(f.type==='multi') out[f.k] = [...el.querySelectorAll('.chip.on')].map(c=>c.dataset.v);
        else if(f.type==='check') out[f.k] = el.checked;
        else if(f.type==='number') out[f.k] = el.value===''?null:parseFloat(el.value);
        else out[f.k] = el.value.trim();
        if(f.req && (out[f.k]===''||out[f.k]==null||(Array.isArray(out[f.k])&&!out[f.k].length))){ toast('Completá: '+f.label,'⚠️'); el.focus?.(); return; }
      }
      if(onSubmit(out, box)!==false){ clearDrafts(); close(true); }
    });
    // Borradores (BUG-04): lo que se escribe en los campos largos se guarda en este navegador
    // hasta que se guarda el formulario; si se cierra sin querer, se recupera al volver a abrirlo.
    const dkey = k => 'anm_draft:'+title+':'+k;
    const longs = fields.filter(f=>f.type==='textarea');
    const clearDrafts = ()=>longs.forEach(f=>{ try{ localStorage.removeItem(dkey(f.k)); }catch(e){} });
    let recovered = false;
    longs.forEach(f=>{ const el = box.querySelector('#f_'+f.k); if(!el) return;
      el.dataset.draft = dkey(f.k);   // lo guarda el escucha general de abajo, aunque el campo se vuelva a dibujar
      try{ const d = localStorage.getItem(dkey(f.k)); if(d && d!==el.value && !el.value.trim()){ el.value = d; recovered = true; } }catch(e){} });
    if(recovered) toast('Recuperé lo que habías escrito antes','📝');
    if(danger) box.querySelector('#mdanger').onclick = ()=>{ if(!danger.confirm || confirm(danger.confirm)){ danger.fn(); close(true); } };
    setTimeout(()=>box.querySelector('input:not([type=checkbox]),textarea')?.focus(), 30);
    return box;
  }

  // Si se escribió algo, cerrar con Escape, clic afuera o Cancelar pregunta antes (BUG-04)
  let modalDirty = false;
  function modal(inner, wide){
    const mo = $('#modal');
    mo.innerHTML = `<div class="mbox ${wide?'wide':''}" role="dialog" aria-modal="true">${inner}</div>`;
    mo.classList.add('open'); modalDirty = false;
    mo.querySelectorAll('[data-close]').forEach(b=>b.onclick = ()=>close());
    mo.querySelector('.mbox').addEventListener('input', e=>{ if(e.target.matches('input:not([readonly]),textarea')) modalDirty = true; });
    return mo.querySelector('.mbox');
  }
  function close(force){
    const mo=$('#modal'); if(!mo.classList.contains('open')) return;
    if(force!==true && modalDirty && !confirm('Hay cambios sin guardar. ¿Cerrar igual?')) return;
    mo.classList.remove('open'); mo.innerHTML=''; modalDirty = false;
  }
  // Borradores: cualquier campo con data-draft se guarda mientras se escribe
  document.addEventListener('input', e=>{ const k = e.target?.dataset?.draft; if(!k) return;
    try{ e.target.value.trim() ? localStorage.setItem(k, e.target.value) : localStorage.removeItem(k); }catch(err){} }, true);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
  document.addEventListener('mousedown', e=>{ if(e.target.id==='modal') close(); });

  function toast(msg, icon='✓', xp){
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
    const box = $('#toasts'); box.appendChild(t);
    while(box.children.length>4) box.firstChild.remove();
    setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 2800);
  }

  function confetti(n=70){
    for(let i=0;i<n;i++){
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random()*100+'vw';
      c.style.background = COLORS[i%COLORS.length];
      c.style.animationDuration = (1.6+Math.random()*1.8)+'s';
      c.style.animationDelay = (Math.random()*.4)+'s';
      document.body.appendChild(c);
      setTimeout(()=>c.remove(), 4000);
    }
  }

  function copy(text){
    navigator.clipboard?.writeText(text).then(()=>toast('Copiado al portapapeles','📋'), ()=>prompt('Copiá este texto:', text));
  }
  const waLink = (text, phone='') => `https://wa.me/${String(phone).replace(/\D/g,'')}?text=${encodeURIComponent(text)}`;
  const mailLink = (to, subject, body) => `mailto:${encodeURIComponent(to||'')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  function download(name, data){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download = name; a.click();
  }

  // Drag & drop simple para tableros kanban: cards [data-drag=id], lanes [data-lane=value]
  function kanban(root, onDrop){
    // En el celular el arrastre no funciona (BUG-25): cada tarjeta tiene un botón "Mover"
    if(window.matchMedia?.('(hover: none)').matches){
      const lanes = [...root.querySelectorAll('[data-lane]')].map(l=>[l.dataset.lane, (l.querySelector('.lane-h, h4, .ph')?.childNodes[0]?.textContent || l.dataset.lane).trim()]);
      root.querySelectorAll('[data-drag]').forEach(c=>{
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn xs g kc-move'; b.textContent = '⇄ Mover'; b.style.marginTop = '6px';
        b.onclick = e=>{ e.stopPropagation(); const cur = c.closest('[data-lane]')?.dataset.lane;
          const box = modal(`<h2>Mover a…<button class="icon-btn x" data-close>✕</button></h2><div class="list">${lanes.map(([k,l])=>`<div class="li click" data-to="${esc(k)}" style="cursor:pointer;${k===cur?'opacity:.5':''}"><div class="grow b">${esc(l)}</div>${k===cur?'<span class="xs faint">acá está</span>':'<span>›</span>'}</div>`).join('')}</div>`);
          box.querySelectorAll('[data-to]').forEach(el=>el.onclick = ()=>{ close(true); if(el.dataset.to!==cur) onDrop(c.dataset.drag, el.dataset.to); }); };
        c.appendChild(b);
      });
    }
    root.querySelectorAll('[data-drag]').forEach(c=>{
      c.draggable = true;
      c.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', c.dataset.drag); c.classList.add('dragging'); });
      c.addEventListener('dragend', ()=>c.classList.remove('dragging'));
    });
    root.querySelectorAll('[data-lane]').forEach(l=>{
      l.addEventListener('dragover', e=>{ e.preventDefault(); l.classList.add('drop'); });
      l.addEventListener('dragleave', ()=>l.classList.remove('drop'));
      l.addEventListener('drop', e=>{ e.preventDefault(); l.classList.remove('drop'); const id=e.dataTransfer.getData('text/plain'); if(id) onDrop(id, l.dataset.lane); });
    });
  }

  // CSV con comillas: "a, b" queda como un solo campo; "" es una comilla (BUG-30)
  function parseCsv(text, sep){
    const t = String(text||''); sep = sep || ((t.split(/\r?\n/)[0]||'').split(';').length > (t.split(/\r?\n/)[0]||'').split(',').length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for(let i=0;i<t.length;i++){ const ch = t[i];
      if(q){ if(ch==='"'){ if(t[i+1]==='"'){ cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if(ch==='"') q = true; else if(ch===sep){ row.push(cell); cell = ''; }
      else if(ch==='\n' || ch==='\r'){ if(ch==='\r' && t[i+1]==='\n') i++; row.push(cell); cell = ''; if(row.some(c=>c.trim())) rows.push(row); row = []; }
      else cell += ch; }
    row.push(cell); if(row.some(c=>c.trim())) rows.push(row);
    return rows;
  }
  // Espera a que se deje de escribir antes de ejecutar (búsquedas, BUG-28)
  const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
  window.UI = { debounce, parseCsv, $, esc, MONTHS, DAYS, COLORS, pad, ymd, today, day, parse, addDays, diffDays, ym, ymLabel, fdate, ago, time, initials,
    safeUrl, safeColor, safeId, avatar, form, modal, close, toast, confetti, copy, waLink, mailLink, download, kanban };
})();
