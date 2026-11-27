// Pruebas de la Fase 1: login con Google, Gmails autorizados y permisos.
const { test, expect } = require('@playwright/test');
const { mockSupabase, sesion, entrar } = require('./helpers');
test.beforeEach(async ({ page }) => { page.on('dialog', d => d.accept()); });

test('sin sesión pide entrar con Google', async ({ page }) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(page.getByText('Entrar con Google')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('un Gmail no autorizado no entra', async ({ page }) => {
  await mockSupabase(page);
  await sesion(page, 'extrano@gmail.com');
  await page.goto('/');
  await expect(page.getByText('Sin acceso')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('solo el dueño autoriza Gmails y define el rol', async ({ page }) => {
  const { ACC } = await mockSupabase(page);
  await entrar(page);
  await page.goto('/#/equipo');
  await page.getByText('Autorizar un Gmail').click();
  await page.fill('#f_email', 'luli@gmail.com');
  await page.click('#mform button[type=submit]');
  await expect.poll(() => ACC.map(a => a.email)).toContain('luli@gmail.com');
  expect(ACC.find(a => a.email === 'luli@gmail.com').role).toBe('equipo');
});

test('el equipo no ve Finanzas ni la lista de accesos, pero puede asignar tareas a otros', async ({ page }) => {
  await mockSupabase(page, { access: [{ email:'socio@gmail.com', role:'owner' }, { email:'equipo@gmail.com', role:'equipo' }],
    seed: { team: { members: [{ id:'m1', name:'Prueba Socio', email:'socio@gmail.com', role:'admin', owner:true, updatedAt:'2026-01-01' }] }, main: { clientes: [] } } });
  await sesion(page, 'equipo@gmail.com');
  await page.goto('/');
  await page.waitForSelector('.hero');
  await expect(page.locator('.sidebar a[href="finanzas.html"]')).toHaveCount(0);
  await page.goto('/#/equipo');
  await expect(page.getByText('Accesos: Gmails que pueden entrar')).toHaveCount(0);
  const opts = await page.evaluate(() => App.assignOpts().map(o => o[1]));
  expect(opts).toContain('Prueba Socio');
  await page.goto('/finanzas.html');
  await expect(page.getByText('Sin acceso')).toBeVisible();
});

test('los links con javascript: se bloquean', async ({ page }) => {
  await mockSupabase(page);
  await entrar(page);
  const r = await page.evaluate(() => [UI.safeUrl('javascript:alert(1)'), UI.safeUrl('canva.com/x'), UI.safeUrl('https://ok.com'), UI.safeColor('red;background:url(x)')]);
  expect(r).toEqual(['', 'https://canva.com/x', 'https://ok.com', '#1A73E8']);
});

test('al entrar por primera vez se vincula con su perfil existente', async ({ page }) => {
  await mockSupabase(page, { seed: { team: { members: [
    { id:'d1', name:'Prueba Socio', role:'admin', owner:true, updatedAt:'2026-01-01' },
    { id:'l1', name:'Luli', role:'equipo', updatedAt:'2026-01-01' }] } } });
  await entrar(page);   // el nombre de Google coincide con "Prueba Socio"
  const me = await page.evaluate(() => App.me());
  expect(me.id).toBe('d1'); expect(me.email).toBe('socio@gmail.com');
});

test('si el nombre no coincide, elige cuál perfil es', async ({ page }) => {
  await mockSupabase(page, { access: [{ email:'luli@gmail.com', role:'equipo' }], seed: { team: { members: [
    { id:'l1', name:'Luli', role:'equipo', updatedAt:'2026-01-01' }] } } });
  await sesion(page, 'luli@gmail.com', 'Lucía Pérez');
  await page.goto('/');
  await page.locator('.li', { hasText: 'Luli' }).click();
  await page.waitForSelector('.hero');
  const me = await page.evaluate(() => App.me());
  expect(me.id).toBe('l1'); expect(me.role).toBe('equipo');
});

test('rol Solo Ventas: entra directo a Ventas y no ve Operaciones ni Finanzas', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  await mockSupabase(page, { access: [{ email:'socio@gmail.com', role:'owner' }, { email:'ventas@gmail.com', role:'ventas' }],
    seed: { team: { members: [{ id:'m1', name:'Prueba Socio', email:'socio@gmail.com', role:'admin', owner:true, updatedAt:'2026-01-01' },
                               { id:'m2', name:'Vera Ventas', email:'ventas@gmail.com', role:'equipo', updatedAt:'2026-01-01' }] },
            ops: { clients: [{ id:'c1', name:'Cliente secreto', updatedAt:'2026-01-01' }] } } });
  await sesion(page, 'ventas@gmail.com');
  await page.goto('/');
  await page.waitForFunction(() => location.hash.startsWith('#/crecimiento'));
  await expect(page.locator('#nav')).toContainText('Ventas');
  await expect(page.locator('#nav a[href="#/ops"]')).toHaveCount(0);
  await expect(page.locator('#nav a[href="#/inicio"]')).toHaveCount(0);
  await page.evaluate(() => location.hash = '#/ops');
  await page.waitForFunction(() => location.hash.startsWith('#/crecimiento'));
  expect(await page.evaluate(() => Store.all('ops','clients').length)).toBe(0);
  expect(await page.evaluate(() => App.me().role)).toBe('ventas');
  expect(errores).toEqual([]);
});

test('el dueño cambia el rol de alguien desde Editar', async ({ page }) => {
  const db = await mockSupabase(page, { access: [{ email:'socio@gmail.com', role:'owner' }, { email:'luli@gmail.com', role:'equipo', member_id:'m2' }],
    seed: { team: { members: [{ id:'m1', name:'Prueba Socio', email:'socio@gmail.com', role:'admin', owner:true, updatedAt:'2026-01-01' },
                               { id:'m2', name:'Luli', email:'luli@gmail.com', role:'equipo', updatedAt:'2026-01-01' }] } } });
  await entrar(page);
  await page.evaluate(() => Team.edit('m2'));
  await page.selectOption('#f_arole', 'ventas');
  await page.click('#mform button[type=submit]');
  await expect.poll(() => db.ACC.find(a => a.email === 'luli@gmail.com').role).toBe('ventas');
  expect(await page.evaluate(() => App.member('m2').role)).toBe('ventas');
});

test('Ajustes: solo los socios; el resto edita su perfil y sale desde su tarjeta', async ({ page }) => {
  await mockSupabase(page, { access: [{ email:'socio@gmail.com', role:'owner' }, { email:'equipo@gmail.com', role:'equipo' }],
    seed: { team: { members: [{ id:'m1', name:'Prueba Socio', email:'socio@gmail.com', role:'admin', owner:true, updatedAt:'2026-01-01' },
                               { id:'m2', name:'Luli', email:'equipo@gmail.com', role:'equipo', updatedAt:'2026-01-01' }] } } });
  await sesion(page, 'equipo@gmail.com');
  await page.goto('/');
  await page.waitForSelector('.hero');
  await expect(page.locator('#nav a[href="#/ajustes"]')).toHaveCount(0);
  await page.evaluate(() => location.hash = '#/ajustes');
  await page.waitForFunction(() => location.hash === '#/inicio');
  await page.click('#me');
  await expect(page.locator('#modal')).toContainText('Editar mi perfil');
  await expect(page.locator('#modal')).toContainText('Cerrar sesión');
  await expect(page.locator('#modal')).not.toContainText('Ajustes');
});
