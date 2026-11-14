// Fase 15: pagos anulados. En Caja el pago queda tachado ("Anulado el …") y su reversa suma; en la campanita, el aviso.
// Datos sintéticos (?fixtures=1&anul=1). Uso: node e2e/anulaciones.mjs <url-base-dev> [carpeta-capturas]
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/', out] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
const T = (s) => '[data-testid="' + s + '"]';

for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  const txt = async (sel) => ((await p.textContent(sel)) ?? '').replace(/\s+/g, ' ').trim();

  // --- Caja
  await p.goto(`${base}?fixtures=1&anul=1#caja`);
  await p.waitForSelector('[data-mov="9901"]', { timeout: 8000 }).catch(() => fallas.push('no aparece el pago anulado'));
  const orig = await txt('[data-mov="9901"]');
  ok(/Anulado el \d{2}\/\d{2}/.test(orig), `el pago no dice "Anulado el": ${orig}`);
  ok(!!(await p.$('[data-mov="9901"] .amt s')), 'el monto del pago anulado no está tachado');
  const rev = await txt('[data-mov="9902"]');
  ok(/Anulación · MERPAGO VIAJES PRUEBA/.test(rev), `la reversa no muestra el detalle: ${rev}`);
  const amt = await txt('[data-mov="9902"] .amt');
  ok(/7\.022/.test(amt) && !/[−-]/.test(amt), `la reversa no suma: ${amt}`);
  ok(await p.$eval('[data-mov="9902"] .amt', (e) => e.classList.contains('good')), 'la reversa no se ve como plata que vuelve');
  ok(!(await p.$('[data-mov="9902"] button[aria-label^="Editar"]')), 'la reversa no debería poder editarse');
  if (out) await p.screenshot({ path: `${out}/a1-caja-${scheme}.png` });

  // --- Campanita
  await p.click(T('campana'));
  await p.waitForSelector(T('aviso-card'));
  const rv = p.locator(T('aviso-card'), { hasText: 'ya volvió a tu liquidez' });
  ok((await rv.count()) === 1, 'falta el aviso de la reversa');
  const trv = ((await rv.textContent()) ?? '').replace(/\s+/g, ' ');
  ok(/\$\s?7\.022.*MERPAGO VIAJES PRUEBA.*anulado el.*devuelto en tu liquidez \(en Transporte\)/.test(trv), `detalle de la reversa: ${trv}`);
  const sc = p.locator(T('aviso-card'), { hasText: 'no habías confirmado' });
  ok(/no cambia nada/.test((await sc.textContent()) ?? ''), 'el aviso sin confirmar no aclara que no cambia nada');
  ok((await sc.locator(T('ver-caja')).count()) === 0, 'el aviso sin confirmar no necesita "Ver en Caja"');
  if (out) await p.screenshot({ path: `${out}/a2-avisos-${scheme}.png` });
  await rv.locator(T('ver-caja')).click();
  await p.waitForFunction(() => location.hash === '#caja', null, { timeout: 3000 }).catch(() => fallas.push('"Ver en Caja" no lleva a Caja'));
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'desborde horizontal');
  await ctx.close();
}
await b.close();
if (errores.length) fallas.push('errores JS: ' + errores.join(' | '));
console.log(fallas.length ? 'FALLAS:\n- ' + fallas.join('\n- ') : 'OK anulaciones');
process.exit(fallas.length ? 1 : 0);
