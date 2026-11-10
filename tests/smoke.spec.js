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
  await page.waitForFunction(() => document.activeElement?.id === 'f_title');
  await page.fill('#f_title', 'Reunión de prueba');
  await page.fill('#f_actionsText', 'Mandar propuesta 15/12');
  await page.click('#mform button[type=submit]');
  await expect.poll(() => page.evaluate(() => Store.all('ops', 'tasks').map(t => t.title))).toContain('Mandar propuesta');
  const m = await page.evaluate(() => Store.all('ops', 'meetings').find(x => x.title === 'Reunión de prueba'));
  expect(m.actions[0].taskId).toBeTruthy();
});

test('abrir Finanzas', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page);
  await entrar(page);
  await page.waitForTimeout(1200);   // que se guarde el perfil en la base simulada
  await page.goto('/finanzas.html');
  await page.waitForSelector('#fp1');
  await page.fill('#fp1', 'fin12345');
  await page.fill('#fp2', 'fin12345');
  await page.click('#fgo');
  await expect(page.getByRole('heading', { name: /La cuenta del mes/ })).toBeVisible();
  expect(errores).toEqual([]);
});
