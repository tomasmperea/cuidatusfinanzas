// Ojito (ocultar saldos) + ajustes en 2 líneas. Uso: node e2e/ojito.mjs <url-base-dev> <carpeta-salida>
import { chromium } from 'playwright';

const [base = 'http://localhost:5173/cuidatusfinanzas/', out = '../capturas'] = process.argv.slice(2);
const browser = await chromium.launch();
const fallas = [];
const errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, colorScheme: 'dark', locale: 'es-AR' });
const p = await ctx.newPage();
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(`${base}?fixtures=1#inicio`);
await p.waitForSelector('[data-testid="ajustes"]');
await p.waitForTimeout(400);
await p.locator('[data-testid="ajustes"]').screenshot({ path: `${out}/ajustes-2lineas.png` });
const cortado = await p.$$eval('[data-testid="ajustes"] .dos-lineas', (els) => els.some((e) => e.scrollHeight > e.clientHeight + 1));
ok(!cortado, 'algún ajuste no entra en 2 líneas');

await p.click('[data-testid="ojito"]');
await p.waitForTimeout(400);
const txt = await p.textContent('main');
ok(!/\$\s?\d/.test(txt), 'quedó algún monto visible con el ojito: ' + (txt.match(/.{0,20}\$\s?\d.{0,10}/) || [''])[0]);
await p.screenshot({ path: `${out}/ojito-inicio.png` });

// persiste al recargar y no tapa lo que se tipea
await p.goto(`${base}?fixtures=1#caja`);
await p.waitForSelector('[data-testid="liquidez-valor"]');
ok((await p.textContent('[data-testid="liquidez-valor"]')).includes('•'), 'el ojito no quedó guardado');
await p.click('[data-atajo="48"]');
for (const k of ['1', '2', '5', '0']) await p.click(`[data-k="${k}"]`);
ok((await p.textContent('[data-testid="monto-reg"]')).includes('1.250'), 'el monto tipeado quedó tapado');
await p.screenshot({ path: `${out}/ojito-caja-hoja.png` });
await p.keyboard.press('Escape');
await p.click('[data-testid="ojito"]');
await p.waitForTimeout(300);
ok((await p.textContent('[data-testid="liquidez-valor"]')).includes('931.673'), 'no vuelve a mostrar los saldos');
await browser.close();
console.log(JSON.stringify({ fallas, errores }, null, 2));
