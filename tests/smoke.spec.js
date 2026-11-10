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
