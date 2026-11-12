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
