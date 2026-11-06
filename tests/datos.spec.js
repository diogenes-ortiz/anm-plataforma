// Fase 2: que no se pierdan ni alteren datos.
const { test, expect } = require('@playwright/test');
const { mockSupabase, entrar } = require('./helpers');
test.beforeEach(async ({ page }) => { page.on('dialog', d => d.accept()); });

test('una edición parcial no pisa la fecha de creación (BUG-03)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const r = await page.evaluate(async () => {
    const t = Store.upsert('ops','tasks',{ title:'x' }); const c = t.createdAt;
    await new Promise(r=>setTimeout(r,20)); Store.upsert('ops','tasks',{ id:t.id, status:'doing' });
    return [c, Store.get('ops','tasks',t.id).createdAt];
  });
  expect(r[1]).toBe(r[0]);
});

test('dos personas cambian campos distintos y quedan los dos (BUG-07)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const r = await page.evaluate(() => {
    const base = { id:'t1', title:'x', status:'todo', due:'', updatedAt:'2026-01-01T00:00:00Z', _f:{ title:'2026-01-01T00:00:00Z', status:'2026-01-01T00:00:00Z', due:'2026-01-01T00:00:00Z' } };
    const a = { ...base, due:'2026-12-01', updatedAt:'2026-02-01T00:00:00Z', _f:{ ...base._f, due:'2026-02-01T00:00:00Z' } };
    const b = { ...base, status:'done', updatedAt:'2026-03-01T00:00:00Z', _f:{ ...base._f, status:'2026-03-01T00:00:00Z' } };
    return Store._mergeDocs({ tasks:[a] }, { tasks:[b] }).tasks[0];
  });
  expect(r.due).toBe('2026-12-01'); expect(r.status).toBe('done');
});

test('un borrado viejo no revive con una copia vieja (BUG-09)', async ({ page }) => {
  await mockSupabase(page); await entrar(page);
  const r = await page.evaluate(() => {
    const borrado = { id:'t1', deleted:true, updatedAt:'2020-01-01T00:00:00Z' };
    const viejo = { id:'t1', title:'revivo', updatedAt:'2019-12-01T00:00:00Z' };
    const limpio = Store._mergeDocs({ tasks:[borrado] }, {}).tasks;
    return [limpio.length, Store._mergeDocs({ tasks:limpio }, { tasks:[viejo] }).tasks[0].deleted];
  });
  expect(r).toEqual([1, true]);
});

test('si otra persona guardó en el medio, se vuelve a leer y no se pisa (BUG-06)', async ({ page }) => {
  const { DB } = await mockSupabase(page); await entrar(page);
  await page.evaluate(() => Store.syncNow());
  // Otra persona agrega una tarea directo en la base
  DB.ops = { ...DB.ops, tasks:[ ...(DB.ops?.tasks||[]), { id:'ajena', title:'De otra persona', updatedAt:'2026-01-01T00:00:00Z' } ] };
  await page.evaluate(async () => { Store.upsert('ops','tasks',{ title:'Mía' }); await Store.syncNow(); });
  await expect.poll(() => (DB.ops.tasks||[]).map(t => t.title).join('|')).toContain('Mía');
  const titles = DB.ops.tasks.map(t => t.title);
  expect(titles).toContain('De otra persona'); expect(titles).toContain('Mía');
});
