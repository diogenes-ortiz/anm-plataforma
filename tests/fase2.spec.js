// Fase 2: errores que afectaban el uso diario.
const { test, expect } = require('@playwright/test');
const { mockSupabase, entrar } = require('./helpers');

test('acuerdos: fecha imposible se ignora y una fecha ya pasada va al año siguiente (BUG-16)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const r = await page.evaluate(() => { const y = new Date().getFullYear(), past = new Date(Date.now()-60*864e5);
    const dd = String(past.getDate()).padStart(2,'0'), mm = String(past.getMonth()+1).padStart(2,'0');
    return [Ops.parseAction('Enviar propuesta 31/02').due, Ops.parseAction(`Llamar ${dd}/${mm}`).due.slice(0,4)*1 - past.getFullYear()]; });
  expect(r).toEqual(['', 1]);
});

test('el día de una tarea hecha de noche es el día local (BUG-15)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const d = await page.evaluate(() => { const x = new Date(); x.setHours(23, 30, 0, 0); return [UI.day(x.toISOString()), UI.ymd(x)]; });
  expect(d[0]).toBe(d[1]);
});

test('CSV con comas entre comillas (BUG-30)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const r = await page.evaluate(() => UI.parseCsv('empresa,notas\n"Acme, SA","dice ""hola"""\n'));
  expect(r).toEqual([['empresa','notas'],['Acme, SA','dice "hola"']]);
});

test('cerrar un formulario con cambios pide confirmación y guarda borrador (BUG-04)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  await page.evaluate(() => Ops.editMeeting());
  await page.fill('#f_minuta', 'Notas importantes');
  let pregunto = false; page.once('dialog', d => { pregunto = true; d.dismiss(); });
  await page.keyboard.press('Escape');
  expect(pregunto).toBe(true);
  await expect(page.locator('#modal.open')).toBeVisible();
  page.once('dialog', d => d.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal.open')).toHaveCount(0);
  await page.evaluate(() => Ops.editMeeting());
  await expect(page.locator('#f_minuta')).toHaveValue('Notas importantes');
});

test('en el celular las tarjetas se mueven con un botón (BUG-25)', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await mockSupabase(page); await entrar(page);
  await page.evaluate(() => Store.upsert('ops','tasks',{ title:'Tarea celu', status:'todo' }));
  await page.goto('/#/ops/tareas'); await page.evaluate(() => Ops.setMode('board'));
  await page.locator('.kc', { hasText: 'Tarea celu' }).locator('.kc-move').click();
  await page.locator('[data-to="doing"]').click();
  await expect.poll(() => page.evaluate(() => Store.all('ops','tasks').find(t => t.title === 'Tarea celu').status)).toBe('doing');
  await ctx.close();
});

test('las tareas repetidas se detectan para revisar (BUG-11)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const n = await page.evaluate(() => { Store.upsert('ops','tasks',{ title:'Video sifón', clientId:'c1' }); Store.upsert('ops','tasks',{ title:'video  sifón', clientId:'c1' }); return Ops.dupGroups().length; });
  expect(n).toBe(1);
});
