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

  function avatar(m, cls=''){
    if(!m) return `<span class="av ${cls}" style="background:var(--surface3);color:var(--text3)">?</span>`;
    return `<span class="av ${cls}" title="${esc(m.name)}" style="background:${m.color||COLORS[0]}">${esc(initials(m.name))}</span>`;
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
      if(onSubmit(out, box)!==false) close();
    });
    if(danger) box.querySelector('#mdanger').onclick = ()=>{ if(!danger.confirm || confirm(danger.confirm)){ danger.fn(); close(); } };
    setTimeout(()=>box.querySelector('input:not([type=checkbox]),textarea')?.focus(), 30);
    return box;
  }

  function modal(inner, wide){
    const mo = $('#modal');
    mo.innerHTML = `<div class="mbox ${wide?'wide':''}">${inner}</div>`;
    mo.classList.add('open');
    mo.querySelectorAll('[data-close]').forEach(b=>b.onclick = close);
    return mo.querySelector('.mbox');
  }
  function close(){ const mo=$('#modal'); mo.classList.remove('open'); mo.innerHTML=''; }
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); });
  document.addEventListener('mousedown', e=>{ if(e.target.id==='modal') close(); });

  function toast(msg, icon='✓', xp){
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>${xp?`<span class="xp">+${xp} XP</span>`:''}`;
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

  window.UI = { $, esc, MONTHS, DAYS, COLORS, pad, ymd, today, parse, addDays, diffDays, ym, ymLabel, fdate, ago, time, initials,
    avatar, form, modal, close, toast, confetti, copy, waLink, mailLink, download, kanban };
})();
