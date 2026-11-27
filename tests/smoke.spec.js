// Pruebas de humo (BASE-05): lo mínimo que tiene que funcionar siempre.
const { test, expect } = require('@playwright/test');
const { mockSupabase, sesion, entrar } = require('./helpers');

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
});

test('entrar a la plataforma', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  await expect(page.locator('#app')).toBeVisible();
  expect(errores).toEqual([]);
});

test('crear una tarea y moverla de columna', async ({ page }) => {
  await mockSupabase(page);
  await entrar(page);
  await page.click('.topbar >> text=Crear');
  await page.click('#modal >> text=Tarea');
  await page.fill('#f_title', 'Tarea de prueba');
  await page.click('#mform button[type=submit]');
  await page.goto('/#/ops/tareas');
  await page.evaluate(() => Ops.setMode('board'));
  const card = page.locator('.kc', { hasText: 'Tarea de prueba' });
  await expect(card).toBeVisible();
  await card.dragTo(page.locator('.lane[data-lane="doing"]'));
  await expect.poll(() => page.evaluate(() => Store.all('ops', 'tasks').find(t => t.title === 'Tarea de prueba')?.status)).toBe('doing');
});

test('crear una reunión y convertir un acuerdo en tarea', async ({ page }) => {
  await mockSupabase(page);
  await entrar(page);
  await page.evaluate(() => Ops.editMeeting());
  await page.waitForFunction(() => document.activeElement?.id === 'f_title');   // el formulario pone el foco a los 30 ms
  await page.fill('#f_title', 'Reunión de prueba');
  await page.fill('#f_actionsText', 'Mandar propuesta 15/12');
  await page.click('#mform button[type=submit]');
  await expect.poll(() => page.evaluate(() => Store.all('ops', 'tasks').map(t => t.title))).toContain('Mandar propuesta');
  const m = await page.evaluate(() => Store.all('ops', 'meetings').find(x => x.title === 'Reunión de prueba'));
  expect(m.actions[0].taskId).toBeTruthy();
});

test('un socio abre Finanzas sin contraseña', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  await page.waitForTimeout(1200);   // que se guarde el perfil en la base simulada
  await expect(page.locator('.sidebar a[href="finanzas.html"]')).toHaveCount(1);
  await page.goto('/finanzas.html');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /La cuenta del mes/ })).toBeVisible();
  expect(errores).toEqual([]);
});

test('asignar equipo a un cliente y que aparezca primero al crear tareas', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const ids = await page.evaluate(() => {
    const luli = Store.upsert('team','members',{ name:'Luli Pagui', role:'member', color:'#3366ff' });
    const otra = Store.upsert('team','members',{ name:'Ana Otra', role:'member', color:'#33aa66' });
    const c = Store.upsert('ops','clients',{ name:'Mipileta', active:true, units:['social'], health:'ok' });
    return { luli:luli.id, otra:otra.id, c:c.id };
  });
  await page.goto('/#/ops/cliente/' + ids.c);
  await page.click('text=＋ Equipo');
  await page.click('#f_teamIds >> text=Luli Pagui');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('.hero')).toContainText('Luli');
  await page.click('.hero >> text=＋ Agregar tarea');
  const opciones = await page.$$eval('#f_assigneeId option', o => o.map(x => x.textContent));
  const primeraDelEquipo = opciones.findIndex(t => t.includes('trabaja la cuenta'));
  expect(opciones[primeraDelEquipo]).toContain('Luli Pagui');
  expect(primeraDelEquipo).toBeLessThan(opciones.findIndex(t => t.includes('Ana Otra')));
  await page.selectOption('#f_clientId', '');
  expect(await page.$$eval('#f_assigneeId option', o => o.some(x => x.textContent.includes('trabaja la cuenta')))).toBe(false);
  expect(errores).toEqual([]);
});

test('tocar el avatar de una tarea para elegir uno o varios responsables', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const ids = await page.evaluate(() => {
    const luli = Store.upsert('team','members',{ name:'Luli Pagui', role:'equipo', color:'#3366ff' });
    const t = Store.upsert('ops','tasks',{ title:'Armar calendario', status:'todo', assigneeId:App.me().id });
    return { luli:luli.id, t:t.id, me:App.me().id };
  });
  await page.goto('/#/ops/tareas');
  await page.evaluate(() => Ops.setMode('list'));
  await page.locator('.av-btn').first().click();
  await page.click('#pa-list >> text=Luli Pagui');
  await page.click('#pa-ok');
  let t = await page.evaluate(id => Store.get('ops','tasks',id), ids.t);
  expect([t.assigneeId, ...(t.alsoIds||[])]).toEqual([ids.me, ids.luli]);
  await expect(page.locator('#modal.open')).toHaveCount(0);
  await page.evaluate(() => Ops.setMode('board'));
  await page.locator('.av-btn').first().click();
  await page.click('#pa-list >> text=Prueba Socio');   // saca a Diogenes: queda solo Luli
  await page.click('#pa-ok');
  t = await page.evaluate(id => Store.get('ops','tasks',id), ids.t);
  expect([t.assigneeId, ...(t.alsoIds||[])]).toEqual([ids.luli]);
  // Luli la ve como suya
  expect(await page.evaluate(([id, l]) => Ops.isMine(Store.get('ops','tasks',id), l), [ids.t, ids.luli])).toBe(true);
  expect(errores).toEqual([]);
});

test('asignación automática por temática y No olvidar del cliente', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const ids = await page.evaluate(() => {
    const luli = Store.upsert('team','members',{ name:'Luli', role:'equipo', color:'#3366ff', email:'lulipagui@gmail.com' });
    const luisi = Store.upsert('team','members',{ name:'Luisi', role:'equipo', color:'#33aa66', email:'luisimastrangelo@gmail.com' });
    const santi = Store.upsert('team','members',{ name:'Santi', role:'admin', color:'#aa3366', email:'saemcordero@gmail.com' });
    const c = Store.upsert('ops','clients',{ name:'Mipileta', active:true, units:['social'], health:'ok' });
    return { luli:luli.id, luisi:luisi.id, santi:santi.id, me:App.me().id, c:c.id };
  });
  const s = await page.evaluate(() => ({
    dis: Asignar.suggest('Diseñar flyer de promo'), cal: Asignar.suggest('Armar calendario de noviembre'),
    web: Asignar.suggest('Arreglar la web'), foto: Asignar.suggest('Sesión de fotos en el local'),
    pauta: Asignar.suggest('Subir pauta de Meta'), est: Asignar.suggest('Armar la estrategia de diciembre'), est2: Asignar.suggest('Preparar propuesta comercial y PPT'), plan: Asignar.suggest('Planificación anual'), rev: Asignar.suggest('Revisar copy'), nada: Asignar.suggest('Llamar al contador') }));
  expect(s.dis).toEqual([ids.luli]); expect(s.cal).toEqual([ids.luisi]); expect(s.web).toEqual([ids.me]);
  expect(s.foto).toEqual([ids.santi]); expect(s.pauta).toEqual([ids.me, ids.santi]); expect(s.rev).toEqual([ids.santi, ids.me]); expect(s.nada).toEqual([]); expect(s.est).toEqual([ids.santi]); expect(s.est2).toEqual([ids.santi]); expect(s.plan).toEqual([ids.santi]);
  // En el formulario se asigna sola al escribir
  await page.goto('/#/ops/cliente/' + ids.c);
  await page.click('.hero >> text=＋ Agregar tarea');
  await page.waitForFunction(() => document.activeElement?.id === 'f_title');
  await page.fill('#f_title', 'Diseñar placa de navidad');
  expect(await page.inputValue('#f_assigneeId')).toBe(ids.luli);
  await page.click('#mform button[type=submit]');
  // No olvidar
  await page.click('button[onclick^="Ops.addPin"]');
  await page.fill('#f_text', 'Mandar el calendario antes del 20');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=Mandar el calendario antes del 20')).toBeVisible();
  // Repartir: una tarea vieja de pauta pasa a Dio y Santi
  await page.evaluate(() => Store.upsert('ops','tasks',{ title:'Pauta de diciembre', status:'todo', assigneeId:'' }));
  await page.goto('/#/equipo');
  await page.click('text=Repartir tareas abiertas');
  await page.click('#rp-go');
  const t = await page.evaluate(() => Store.all('ops','tasks').find(x => x.title === 'Pauta de diciembre'));
  expect([t.assigneeId, ...t.alsoIds]).toEqual([ids.me, ids.santi]);
  expect(errores).toEqual([]);
});

test('borrar reuniones pasadas de a una y varias juntas', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  await page.evaluate(() => { ['A','B','C'].forEach((x,i) => Store.upsert('ops','meetings',{ title:'Reunión '+x, date:UI.addDays(UI.today(),-(i+2))+'T10:00', type:'cliente' }));
    Store.upsert('ops','meetings',{ title:'Reunión futura', date:UI.addDays(UI.today(),3)+'T10:00', type:'cliente' }); });
  await page.goto('/#/ops/reuniones');
  await page.locator('.li:has-text("Reunión A") button[title="Borrar reunión"]').click();
  await expect(page.locator('text=Reunión A')).toHaveCount(0);
  await page.click('text=☑ Seleccionar para borrar');
  await page.click('text=Seleccionar todas');
  await page.click('button:has-text("🗑 Borrar 2")');
  const quedan = await page.evaluate(() => Store.all('ops','meetings').map(m => m.title));
  expect(quedan).toEqual(['Reunión futura']);
  expect(errores).toEqual([]);
});

test('apodos: se editan en el perfil y se usan en avisos, @menciones y reglas', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const id = await page.evaluate(() => Store.upsert('team','members',{ name:'Lucía Pagui', role:'equipo', color:'#3366ff' }).id);
  await page.evaluate(i => Team.edit(i), id);
  await page.fill('#f_nick', 'Luli');
  await page.click('#mform button[type=submit]');
  await page.goto('/#/equipo');
  await expect(page.locator('text=“Luli”')).toBeVisible();
  const r = await page.evaluate(i => ({ short: App.short(App.member(i)), mention: Ops.parseAction ? Ops.parseAction('Armar flyer @Luli').assigneeId : null,
    regla: Asignar.suggest('Diseñar flyer')[0] }), id);
  expect(r.short).toBe('Luli');
  if (r.mention !== null) expect(r.mention).toBe(id);
  expect(r.regla).toBe(id);
  expect(errores).toEqual([]);
});

test('Finanzas: comisión de un cliente y recordatorio de pago', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page, { seed: { main: { clientes: [{ id:1, nombre:'Mipileta', tipo:'mensual', retainer:100000, moneda:'ARS', estado:'activo', inicioServicio:'2026-01', retainerHistory:[{ monto:100000, desde:'2026-01' }], empleadoIds:[] }], empleados:[], gastos:[], proyectos:[] } } });
  await entrar(page);
  await page.waitForTimeout(1200);
  await page.goto('/finanzas.html');
  await expect(page.getByRole('heading', { name: /La cuenta del mes/ })).toBeVisible();
  await page.click('a[title="Editar monto"][onclick*="editIngreso(\'c\',\'1\'"] >> nth=0');
  await page.waitForFunction(() => document.activeElement?.id === 'f_monto');
  await page.selectOption('#f_comTipo', 'pct');
  await page.fill('#f_comValor', '10');
  await page.fill('#f_comPara', 'Juan');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=COMISIONES').first()).toBeVisible();
  await expect(page.locator('text=Juan · 10% de Mipileta').first()).toBeVisible();
  await expect(page.locator('text=Comisión 10% → Juan')).toBeVisible();
  // Monto fijo en vez de %
  await page.click('a[title="Editar monto"][onclick*="editIngreso(\'c\',\'1\'"] >> nth=0');
  await page.waitForFunction(() => document.activeElement?.id === 'f_monto');
  await page.selectOption('#f_comTipo', 'monto');
  await page.fill('#f_comValor', '15000');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=Comisión $15.000 fijo → Juan').first()).toBeVisible();
  await page.click('text=Sin recordar · Recordar');
  await expect(page.locator('button:has-text("Recordado")')).toBeVisible();
  // Pago a los socios con fecha
  await page.click('button[onclick*="Fin.pagoSocio"] >> nth=0');
  await page.fill('#f_fecha', '2026-11-14');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('button:has-text("Pagado 14 nov")').first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('completar una tarea y sumar un extra', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const id = await page.evaluate(() => { const c = Store.upsert('ops','clients',{ name:'Mipileta', active:true, units:['social'], health:'ok' });
    return Store.upsert('ops','tasks',{ title:'Armar 5 placas', clientId:c.id, status:'doing', assigneeId:App.me().id }).id; });
  await page.goto('/#/ops/tareas');
  await page.evaluate(() => Ops.setMode('list'));
  await page.click('button[title="La tarea se hizo, pero se suma algo extra"]');
  await page.fill('#f_title', 'Sumar 2 placas para historias');
  await page.click('#mform button[type=submit]');
  const r = await page.evaluate(i => ({ padre: Store.get('ops','tasks',i).status, hijo: Store.all('ops','tasks').find(t => t.parentId === i) }), id);
  expect(r.padre).toBe('done');
  expect(r.hijo.title).toBe('Sumar 2 placas para historias');
  expect(r.hijo.status).toBe('todo');
  await expect(page.locator('text=↳ Extra de “Armar 5 placas”')).toBeVisible();
  expect(errores).toEqual([]);
});

test('status del cliente: lo que ya hicimos va al final', async ({ page }) => {
  await mockSupabase(page);
  await entrar(page);
  const txt = await page.evaluate(() => { const c = Store.upsert('ops','clients',{ name:'Mipileta', active:true, units:['social'], health:'ok' });
    Store.upsert('ops','tasks',{ title:'Calendario diciembre', clientId:c.id, area:'CONTENIDO', status:'doing' });
    Store.upsert('ops','tasks',{ title:'Reels de noviembre', clientId:c.id, area:'CONTENIDO', status:'done', doneAt:new Date().toISOString() });
    Store.upsert('ops','tasks',{ title:'Landing navidad', clientId:c.id, area:'WEB', status:'done', doneAt:new Date().toISOString() });
    return Ops.statusText ? Ops.statusText(c.id) : null; });
  if (txt === null) return;
  const iHicimos = txt.indexOf('LO QUE YA HICIMOS');
  expect(iHicimos).toBeGreaterThan(txt.indexOf('Calendario diciembre'));
  expect(txt.indexOf('Reels de noviembre')).toBeGreaterThan(iHicimos);
  expect(txt.indexOf('Landing navidad')).toBeGreaterThan(iHicimos);
  expect(txt.indexOf('*WEB*')).toBe(-1);   // un área con todo hecho no aparece arriba
});

test('posponer o sacar un seguimiento desde Tu foco de hoy', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  const ids = await page.evaluate(() => {
    const a = Store.upsert('growth','leads',{ company:'Sanitarios Sione', stage:'propuesta', ownerId:App.me().id, nextFollowUp:UI.addDays(UI.today(),-4), nextAction:'Seguimiento de la propuesta' });
    const b = Store.upsert('growth','leads',{ company:'Otra SA', stage:'contactado', ownerId:App.me().id, nextFollowUp:UI.today() });
    const c = Store.upsert('ops','clients',{ name:'Coarmi', active:true, units:['web'], health:'ok', ownerId:App.me().id });
    return { a:a.id, b:b.id, c:c.id };
  });
  await page.goto('/#/inicio');
  await page.locator('.li:has-text("Seguimiento: Sanitarios Sione") button[title^="Posponer"]').click();
  await page.fill('#sz-why', 'no saturarlo');
  await page.click('#modal >> text=En 1 mes');
  await expect(page.locator('text=Seguimiento: Sanitarios Sione')).toHaveCount(0);
  await page.locator('.li:has-text("Seguimiento: Otra SA") button[title^="Posponer"]').click();
  await page.click('#modal >> text=Sacar el seguimiento');
  await page.locator('.li:has-text("Actualizar Coarmi") button[title^="Posponer"]').click();
  await page.click('#modal >> text=1 semana');
  await expect(page.locator('text=Actualizar Coarmi')).toHaveCount(0);
  const r = await page.evaluate(i => ({ a: Store.get('growth','leads',i.a).nextFollowUp, b: Store.get('growth','leads',i.b).nextFollowUp,
    nota: Store.all('growth','interactions').find(x => x.leadId === i.a)?.text }), ids);
  expect(r.a).toBe(await page.evaluate(() => UI.addDays(UI.today(), 30)));
  expect(r.b).toBe('');
  expect(r.nota).toContain('no saturarlo');
  expect(errores).toEqual([]);
});

test('Finanzas: inflación (revisión trimestral) y capacidad del equipo', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await page.route('**/api.argentinadatos.com/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify([{ fecha:'2026-07-31', valor:2 }, { fecha:'2026-08-31', valor:2 }, { fecha:'2026-09-30', valor:3 }, { fecha:'2026-10-31', valor:2.5 }]) }));
  await mockSupabase(page, {
    seed: { main: { clientes: [{ id:1, nombre:'Mipileta', tipo:'mensual', retainer:100000, moneda:'ARS', estado:'activo', inicioServicio:'2026-01', retainerHistory:[{ monto:100000, desde:'2026-08' }], empleadoIds:[] }], empleados:[{ id:5, nombre:'Luli', sueldo:500000, estado:'activo', inicioLaboral:'2026-01', sueldoHistory:[{ monto:500000, desde:'2026-07' }] }], gastos:[], proyectos:[] },
      team: { members: [{ id:'m1', name:'Prueba Socio', email:'socio@gmail.com', role:'admin', owner:true, updatedAt:'2026-01-01' }, { id:'m2', name:'Luli', role:'equipo', units:['pauta'], capClientes:2, updatedAt:'2026-01-01' }] },
      ops: { clients: [1,2,3].map(i => ({ id:'c'+i, name:'Cliente '+i, units:['pauta'], teamIds:['m2'], updatedAt:'2026-01-01' })) } } });
  await entrar(page);
  await page.waitForTimeout(1000);
  await page.goto('/finanzas.html');
  await expect(page.getByRole('heading', { name: /La cuenta del mes/ })).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#infl summary')?.textContent.includes('Octubre'), null, { timeout: 8000 });
  await page.click('#infl summary');
  // Mipileta aumentó en agosto: inflación ago+sep+oct = 1.02*1.03*1.025-1 ≈ 7,7%
  await expect(page.locator('#infl')).toContainText('7,7%');
  await expect(page.locator('#infl')).toContainText('$108.000');
  await expect(page.locator('#infl')).toContainText('SUELDOS DEL EQUIPO');
  await page.click('text=Ya lo revisé');
  await expect(page.locator('#infl')).toContainText('Próxima revisión');
  await page.click('text=👥 Capacidad');
  await expect(page.locator('text=Contratar o redistribuir: Pauta')).toBeVisible();
  await expect(page.locator('#page')).toContainText('3 de 2 clientes');
  expect(errores).toEqual([]);
});

test('Finanzas: freelance que cobra por cuenta, con desglose', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  const cli = (id, nombre, monto) => ({ id, nombre, tipo:'mensual', retainer:monto, moneda:'ARS', estado:'activo', inicioServicio:'2026-01', retainerHistory:[{ monto, desde:'2026-01' }], empleadoIds:[] });
  await mockSupabase(page, { seed: { main: { clientes: [cli(1,'Mipileta',100000), cli(2,'Froz',200000)], empleados:[{ id:7, nombre:'Belu', sueldo:300000, estado:'activo', inicioLaboral:'2026-01', sueldoHistory:[{ monto:300000, desde:'2026-01' }] }], gastos:[], proyectos:[] } } });
  await entrar(page);
  await page.waitForTimeout(1000);
  await page.goto('/finanzas.html');
  await expect(page.getByRole('heading', { name: /La cuenta del mes/ })).toBeVisible();
  await page.evaluate(() => Fin.editGasto('eq', '7'));
  await page.selectOption('#f_pago', 'cuenta');
  const fila = n => page.locator(`#pc-box .li:has-text("${n}")`);
  await fila('Mipileta').locator('.pc-on').check();
  await fila('Mipileta').locator('.pc-val').fill('30000');
  await fila('Froz').locator('.pc-on').check();
  await fila('Froz').locator('.pc-tipo').selectOption('pct');
  await fila('Froz').locator('.pc-val').fill('20');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=Belu · freelance').first()).toBeVisible();
  await expect(page.locator('text=Mipileta $30.000 + Froz $40.000 (20% de $200.000)').first()).toBeVisible();
  await expect(page.locator('tr:has-text("Belu · freelance")').first()).toContainText('$70.000');
  expect(errores).toEqual([]);
});

test('Finanzas: proyecciones con costos y meta de ganancia editable', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page, { seed: { main: { clientes: [{ id:1, nombre:'Mipileta', tipo:'mensual', retainer:1000000, moneda:'ARS', estado:'activo', inicioServicio:'2026-01', retainerHistory:[{ monto:1000000, desde:'2026-01' }], empleadoIds:[] }],
    empleados:[{ id:7, nombre:'Luli', sueldo:400000, estado:'activo', inicioLaboral:'2026-01', sueldoHistory:[{ monto:400000, desde:'2026-01' }] }], gastos:[], proyectos:[] } } });
  await entrar(page);
  await page.waitForTimeout(1000);
  await page.goto('/finanzas.html');
  await page.click('text=🔭 Proyecciones');
  await page.click('text=Definir metas >> nth=0');
  await page.fill('#f_ganancia12', '9600000');   // 800.000 por mes; la proyección da 600.000
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=no llegan a la meta de ganancia')).toBeVisible();
  await expect(page.locator('#page')).toContainText('75%');
  await expect(page.locator('th:has-text("Equipo")')).toBeVisible();
  await page.click('text=Acumulado vs. meta');
  await expect(page.locator('text=Meta acumulada').or(page.locator('text=Línea amarilla punteada'))).toBeVisible();
  // se vuelve a editar
  await page.click('text=Editar metas >> nth=0');
  await expect(page.locator('#f_ganancia12')).toHaveValue('9600000');
  await page.fill('#f_ganancia12', '7200000');
  await page.click('#mform button[type=submit]');
  await expect(page.locator('text=llegan a la meta de ganancia').first()).toBeVisible();
  await expect(page.locator('#page')).toContainText('100%');
  expect(errores).toEqual([]);
});
