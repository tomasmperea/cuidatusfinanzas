// Recorrido de la pantalla Caja contra `vite dev` con ?fixtures=1 (escrituras simuladas en memoria).
// Uso: node e2e/caja.mjs <url-base-dev> <carpeta-salida>   (la salida va FUERA del repo)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:5173/cuidatusfinanzas/', out = '../capturas'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errores = [];
const fallas = [];
const chicos = new Set();
const ok = (cond, msg) => { if (!cond) fallas.push(msg); };

for (const scheme of ['dark', 'light']) {
  const s = scheme === 'light' ? 'claro' : 'oscuro';
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, colorScheme: scheme, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errores.push(`[${s}] ${m.text()}`));
  p.on('pageerror', (e) => errores.push(`[${s}] ${e.message}`));
  await p.goto(`${base}?fixtures=1#caja`);
  await p.waitForSelector('[data-testid="liquidez-valor"]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/caja-${s}.png` });
  if (scheme === 'light') { await p.screenshot({ path: `${out}/caja-completa-${s}.png`, fullPage: true }); continue; }

  const liq0 = await p.textContent('[data-testid="liquidez-valor"]');
  ok(liq0.includes('931.673'), `liquidez inicial: ${liq0}`);

  // táctiles
  const r = await p.$$eval('button, a, input', (els) => els.filter((e) => e.offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) };
  }).filter((x) => x.h < 40 || x.w < 40));
  r.forEach((x) => chicos.add(`caja: "${x.t}" ${x.w}×${x.h}`));

  // 1) atajo Comida + calculadora 18540 + 6460
  await p.click('[data-atajo="48"]');
  await p.waitForSelector('[data-testid="hoja-registro"]');
  for (const k of ['1', '8', '5', '4', '0', '+', '6', '4', '6', '0']) await p.click(`[data-k="${k}"]`);
  const m = await p.textContent('[data-testid="monto-reg"]');
  ok(m.includes('25.000'), `monto calculado: ${m}`);
  const prev = await p.textContent('[data-testid="previa"]');
  ok(prev.includes('906.673'), `vista previa: ${prev}`);
  await p.screenshot({ path: `${out}/caja-hoja-${s}.png` });
  await p.click('[data-testid="guardar"]');
  await p.waitForSelector('[data-testid="toast"]');
  await p.waitForTimeout(300);
  const liq1 = await p.textContent('[data-testid="liquidez-valor"]');
  ok(liq1.includes('906.673'), `liquidez después de guardar: ${liq1}`);
  await p.screenshot({ path: `${out}/caja-guardado-${s}.png` });

  // 2) editar: 25.000 → 30.000
  await p.click('li.mv >> nth=0 >> [aria-label^="Editar"]');
  await p.waitForSelector('[data-testid="hoja-registro"]');
  for (let i = 0; i < 6; i++) await p.click('[data-k="del"]');
  for (const k of ['3', '0', '0', '0', '0']) await p.click(`[data-k="${k}"]`);
  await p.click('[data-testid="guardar"]');
  await p.waitForTimeout(400);
  const liq2 = await p.textContent('[data-testid="liquidez-valor"]');
  ok(liq2.includes('901.673'), `liquidez después de editar: ${liq2}`);

  // 3) borrar y deshacer
  await p.click('li.mv >> nth=0 >> [aria-label^="Borrar"]');
  await p.waitForSelector('[data-testid="toast"] >> text=Deshacer');
  await p.waitForTimeout(300);
  ok((await p.textContent('[data-testid="liquidez-valor"]')).includes('931.673'), 'liquidez después de borrar');
  await p.click('[data-testid="toast"] >> text=Deshacer');
  await p.waitForTimeout(400);
  ok((await p.textContent('[data-testid="liquidez-valor"]')).includes('901.673'), 'liquidez después de deshacer');

  // 4) "+" sin categoría: valida
  await p.click('[data-testid="fab"]');
  await p.waitForSelector('[data-testid="categorias"]');
  await p.screenshot({ path: `${out}/caja-categorias-${s}.png` });
  await p.click('[data-subcat="56"]');
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/caja-tarjeta-${s}.png` });
  await p.click('text=Provincia');
  for (const k of ['5', '0', '0', '0']) await p.click(`[data-k="${k}"]`);
  await p.click('[data-testid="guardar"]');
  await p.waitForTimeout(400);
  ok((await p.textContent('[data-testid="liquidez-valor"]')).includes('896.673'), 'pago de tarjeta');

  // 5) confirmar un pago "a confirmar" (franja → revisión de a uno; el detalle completo está en e2e/confirmar.mjs)
  ok((await p.textContent('[data-testid="pendientes"]')).includes('2'), 'la franja cuenta 2 pendientes');
  await p.click('[data-testid="pendientes"]');
  await p.waitForSelector('[data-testid="hoja-confirmar"]');
  ok((await p.textContent('[data-testid="conf-monto"]')).includes('47.300'), 'monto del mail');
  await p.screenshot({ path: `${out}/caja-confirmar-${s}.png` });
  ok(await p.isDisabled('[data-testid="conf-confirmar"]'), 'sin categoría no deja confirmar');
  await p.click('[data-testid="conf-otra"]');
  await p.click('[data-testid="conf-todas"] [data-subcat="3"]');
  await p.click('[data-testid="conf-confirmar"]');
  await p.waitForSelector('[data-testid="toast-paso"]');
  await p.click('[data-testid="conf-cerrar"]');
  await p.waitForTimeout(400);
  ok((await p.textContent('[data-testid="pendientes"]')).includes('1'), 'queda 1 pendiente al confirmar el primero');

  // 6) transferencia a Dólares (dos montos)
  await p.click('[data-atajo="transferir"]');
  await p.waitForSelector('[data-testid="chip-destino"]');
  await p.click('[data-testid="chip-destino"]');
  await p.click('.sheet >> text=Dólares');
  for (const k of ['5', '0', '0', '0', '0']) await p.click(`[data-k="${k}"]`);
  await p.click('[data-testid="guardar"]');
  await p.waitForTimeout(200);
  ok(await p.isVisible('[data-testid="error-reg"]'), 'pide el monto en dólares');
  for (const k of ['4', '0']) await p.click(`[data-k="${k}"]`);
  await p.screenshot({ path: `${out}/caja-usd-${s}.png` });
  await p.click('[data-testid="guardar"]');
  await p.waitForTimeout(400);
  ok((await p.textContent('[data-cuenta="2"]')).includes('40'), 'saldo en dólares');
  await p.screenshot({ path: `${out}/caja-final-${s}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ fallas, errores, chicos: [...chicos] }, null, 2));
