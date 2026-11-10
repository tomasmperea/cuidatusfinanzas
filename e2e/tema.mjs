// Tema: sigue al sistema del teléfono (claro u oscuro). Sin switch y sin pedir la fuente afuera.
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/'] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
for (const [esquema, esperado] of [['dark', 'rgb(20, 18, 26)'], ['light', 'rgb(247, 244, 239)']]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: esquema });
  p.on('pageerror', (e) => errores.push(e.message));
  const externos = [];
  p.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname)) externos.push(u.hostname); });
  await p.goto(`${base}?fixtures=1#inicio`);
  await p.waitForSelector('[data-testid="kpi-liquidez"]');
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(fondo === esperado, `con el sistema en ${esquema} el fondo es ${fondo}`);
  ok(!(await p.$('[data-testid="tema"]')), 'quedó el switch de tema');
  ok((await p.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Plus Jakarta'), 'fuente');
  ok(!externos.some((h) => /google|gstatic/.test(h)), `pidió la fuente afuera: ${externos}`);
  await p.close();
}
await b.close();
if (errores.length) fallas.push(...errores);
console.log(fallas.length ? 'FALLAS:\n- ' + fallas.join('\n- ') : 'tema OK');
process.exit(fallas.length ? 1 : 0);
