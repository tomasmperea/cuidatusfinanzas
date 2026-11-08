// Accesos directos: ?accion=… abre Caja con la hoja lista y limpia la URL. Uso: node e2e/atajos.mjs <url-base-dev>
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/'] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
for (const [accion, check] of [['gasto', '[data-testid="categorias"]'], ['ingreso', '[data-testid="categorias"]'], ['transferencia', '[data-testid="chip-destino"]']]) {
  const p = await (await b.newContext({ viewport: { width: 412, height: 915 } })).newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${base}?fixtures=1&accion=${accion}#caja`);
  await p.waitForSelector('[data-testid="hoja-registro"]', { timeout: 8000 }).catch(() => fallas.push(`${accion}: no abrió la hoja`));
  ok(await p.isVisible(check), `${accion}: falta ${check}`);
  ok(!p.url().includes('accion='), `${accion}: la URL quedó con ?accion`);
  ok(p.url().endsWith('#caja'), `${accion}: no quedó en Caja`);
  if (accion === 'ingreso') ok((await p.textContent('[data-testid="hoja-registro"]')).includes('Ingreso'), 'ingreso: tipo incorrecto');
  await p.reload(); await p.waitForTimeout(800);
  ok(!(await p.isVisible('[data-testid="hoja-registro"]')), `${accion}: recargar volvió a abrir la hoja`);
}
await b.close();
console.log(JSON.stringify({ fallas, errores }));
