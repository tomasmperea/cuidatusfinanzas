// Fase 13: avisos de vencimiento en la campanita y "¿Qué tarjeta uso hoy?" en Caja (datos sintéticos).
// Uso: node e2e/vencimientos.mjs <url-base-dev> [carpeta-capturas]
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/', out] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
const sinDesborde = async (p, donde) => ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `desborde horizontal en ${donde}`);

for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  const foto = async (n) => { if (out) await p.screenshot({ path: `${out}/${n}-${scheme}.png` }); };

  // --- Campanita con vencimientos
  await p.goto(`${base}?fixtures=1&venc=1#inicio`);
  await p.waitForSelector('[data-testid="badge"]', { timeout: 8000 }).catch(() => fallas.push('sin contador'));
  ok((await p.textContent('[data-testid="badge"]'))?.trim() === '4', 'el contador no es 4 (2 + 2 vencimientos)');
  await p.click('[data-testid="campana"]');
  await p.waitForSelector('[data-testid="aviso-card"]');
  const cards = p.locator('[data-testid="aviso-card"]');
  ok((await cards.count()) === 5, 'no hay 5 avisos abiertos');
  const gas = cards.filter({ hasText: 'Gas vence el 13/11' });
  ok((await gas.count()) === 1, 'falta el aviso del gas');
  ok(/\$\s?16\.013.*vence el 13\/11/.test(await gas.textContent()), 'el detalle del gas no muestra monto y fecha');
  const tc = cards.filter({ hasText: 'venció el 08/11' });
  ok(await tc.evaluate((e) => e.classList.contains('urgente')), 'el vencido no se marca urgente');
  ok(/USD/.test(await tc.textContent()) && /el banco debita el 02\/11/.test(await tc.textContent()), 'el vencido no muestra USD y débito del banco');
  ok(!(await gas.evaluate((e) => e.classList.contains('urgente'))), 'el "por vencer" no debería ser urgente');
  await foto('v1-avisos');
  await sinDesborde(p, 'avisos');

  // "Ya lo pagué" lo pasa a revisados
  await gas.locator('[data-testid="validar"]').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="aviso-card"]').length === 4);
  await p.click('[data-testid="ver-revisados"]');
  ok(await p.locator('.avisos-rev li', { hasText: 'Gas vence' }).filter({ hasText: 'Pagado' }).count() === 1, 'no figura como pagado en revisados');

  // "Ver compromisos" navega y cierra la hoja
  await tc.locator('[data-testid="ver-compromisos"]').click();
  await p.waitForFunction(() => location.hash === '#compromisos', null, { timeout: 3000 }).catch(() => fallas.push('no fue a compromisos'));
  ok(!(await p.$('[data-testid="hoja-avisos"]')), 'la hoja de avisos sigue abierta');

  // --- Caja: ¿Qué tarjeta uso hoy?
  await p.goto(`${base}?fixtures=1#caja`);
  await p.waitForSelector('[data-testid="tarjetas-hoy"]', { timeout: 8000 }).catch(() => fallas.push('no aparece ¿Qué tarjeta uso hoy?'));
  const head = await p.textContent('[data-testid="tarjetas-hoy-toggle"]');
  ok(/Visa Banco A\s*30\s*días/.test(head), `en el empate no va primero la que cierra antes: ${head}`);
  ok(!/\(/.test(head), 'el nombre corto conserva el paréntesis');
  ok(!(await p.$('[data-testid="tarjetas-hoy-lista"]')), 'arranca desplegada');
  await foto('v2-caja');
  await p.click('[data-testid="tarjetas-hoy-toggle"]');
  const lista = p.locator('[data-testid="tarjetas-hoy-lista"] li');
  ok((await lista.count()) === 4, 'no lista 4 tarjetas');
  const txt = await lista.allTextContents();
  ok(/^Visa Banco A\s*30 días\s*Cierra hoy · pagás 10\/12$/.test(txt[0].trim()), `fila 1: ${txt[0]}`);
  ok(/^Master Banco A\s*30 días\s*Cierra 17\/11 · pagás 10\/12$/.test(txt[1].trim()), `fila 2: ${txt[1]}`);
  ok(/^Visa Banco B\s*24 días\s*Cierra 26\/11 · pagás 04\/12$/.test(txt[3].trim()), `fila 4: ${txt[3]}`);
  ok(await p.evaluate(() => [...document.querySelectorAll('[data-testid="tarjetas-hoy"] .ell')].every((e) => e.scrollWidth <= e.clientWidth + 1)), 'hay nombres cortados');
  await foto('v3-caja-abierta');
  await sinDesborde(p, 'caja');
  // las otras funciones de Caja siguen ahí
  ok(!!(await p.$('[data-testid="fab"]')) && !!(await p.$('[data-testid="liquidez-caja"]')), 'Caja perdió el FAB o la liquidez');
  await ctx.close();
}
await b.close();
if (errores.length) fallas.push('errores JS: ' + errores.join(' | '));
console.log(fallas.length ? 'FALLAS:\n- ' + fallas.join('\n- ') : 'OK vencimientos');
process.exit(fallas.length ? 1 : 0);
