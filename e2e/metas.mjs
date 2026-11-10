// Metas (diseño A) y campanita (diseño A) con datos sintéticos.
// Uso: node e2e/metas.mjs <url-base-dev> [carpeta-capturas]
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
  const foto = async (n) => { if (out && scheme === 'dark') await p.screenshot({ path: `${out}/${n}.png` }); };

  // --- Inicio: tarjeta de metas + campanita con contador
  await p.goto(`${base}?fixtures=1#inicio`);
  await p.waitForSelector('[data-testid="tarjeta-metas"]', { timeout: 8000 }).catch(() => fallas.push('no aparece la tarjeta de metas'));
  ok((await p.$$('[data-testid="meta-fila"]')).length === 2, 'la tarjeta no muestra 2 metas');
  await p.waitForSelector('[data-testid="badge"]', { timeout: 3000 }).catch(() => fallas.push('sin contador en la campanita'));
  ok((await p.textContent('[data-testid="badge"]'))?.trim() === '2', 'el contador no es 2');
  await foto('m1-inicio');
  await sinDesborde(p, 'inicio');

  // --- Campanita: hoja con avisos accionables
  await p.click('[data-testid="campana"]');
  await p.waitForSelector('[data-testid="hoja-avisos"] [data-testid="aviso-card"]');
  ok((await p.$$('[data-testid="aviso-card"]')).length === 3, 'no hay 3 avisos para revisar');
  await foto('m2-avisos');
  await p.click('[data-testid="aviso-card"] >> nth=0 >> [data-testid="validar"]');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="aviso-card"]').length === 2);
  await p.waitForFunction(() => document.querySelector('[data-testid="badge"]')?.textContent?.trim() === '1', null, { timeout: 2000 }).catch(() => fallas.push('el contador no bajó a 1'));
  await p.click('[data-testid="no-reconozco"]');
  await p.waitForSelector('[data-testid="detalle-cargo"]', { timeout: 2000 }).catch(() => fallas.push('no muestra el detalle del cargo'));
  const cargo = await p.textContent('[data-testid="detalle-cargo"]');
  ok(cargo.includes('Visa de prueba') && cargo.includes('01234') && cargo.includes('STREAMING SA') && cargo.includes('preguntale primero'), `detalle del cargo incompleto: ${cargo}`);
  await foto('m2b-cargo');
  await p.click('[data-testid="detalle-cargo"] >> xpath=ancestor::article >> [data-testid="preguntar"]');
  await p.waitForSelector('[data-testid="hoja-asistente"]');
  const preCargo = await p.inputValue('[data-testid="asis-input"]');
  ok(preCargo.includes('No reconozco el cargo') && preCargo.includes('Visa de prueba'), `pregunta del cargo incorrecta: ${preCargo}`);
  await p.waitForFunction(() => document.activeElement?.id === 'asis-in');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid="hoja-avisos"]');
  await p.waitForFunction(() => !document.querySelector('[data-testid="badge"]'), null, { timeout: 2000 }).catch(() => fallas.push('el contador sigue visible con 0 nuevas'));
  await p.click('[data-testid="ver-revisados"]');
  ok(await p.isVisible('text=Está bien'), 'no lista los revisados');
  // Preguntar abre el asistente con el texto precargado, sin el nombre de la meta
  await p.click('[data-testid="aviso-card"] >> text=Meta Viaje >> xpath=ancestor::article >> [data-testid="preguntar"]');
  await p.waitForSelector('[data-testid="hoja-asistente"]');
  const pre = await p.inputValue('[data-testid="asis-input"]');
  ok(pre.includes('va atrasada') && !pre.includes('Viaje'), `texto precargado incorrecto: ${pre}`);
  await p.waitForFunction(() => document.activeElement?.id === 'asis-in');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid="hoja-avisos"]', { timeout: 2000 }).catch(() => fallas.push('Escape en el asistente cerró también los avisos'));
  await p.click('[data-testid="ver-meta"]');
  await p.waitForSelector('[data-testid="detalle-meta"]', { timeout: 4000 }).catch(() => fallas.push('Ver meta no abre el detalle'));

  // --- Detalle
  ok((await p.textContent('[data-testid="detalle-meta"]')).includes('70% de la reserva'), 'el detalle no muestra el % de la reserva');
  ok(await p.isVisible('.graf-meta svg'), 'falta el gráfico');
  ok(await p.isVisible('[data-testid="pronostico"]'), 'falta el pronóstico');
  await foto('m3-detalle');
  await sinDesborde(p, 'detalle');

  // --- Lista + nueva meta (reparto al 100%)
  await p.goto(`${base}?fixtures=1#metas`);
  await p.waitForSelector('[data-testid="reserva"]');
  ok(!(await p.isVisible('text=Libre para asignar')), 'muestra "libre para asignar" con metas');
  ok(await p.isVisible('[data-testid="valle-metas"]'), 'no avisa que el valle toca las metas');
  await foto('m4-lista');
  await p.click('[data-testid="fab-meta"]');
  await p.waitForSelector('[data-testid="hoja-meta"]');
  ok(await p.isDisabled('[data-testid="meta-guardar"]'), 'crear habilitado sin datos');
  await p.fill('[data-testid="meta-nombre"]', 'Auto');
  await p.fill('[data-testid="meta-monto"]', '2000000');
  ok((await p.inputValue('[data-testid="meta-monto"]')) === '$2.000.000', 'el monto no se formatea');
  await p.click('[data-testid="hoja-meta"] >> text=1 año');
  await p.$eval('[data-testid="meta-pct"]', (e) => { e.value = '20'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForSelector('[data-testid="meta-preview"]', { timeout: 4000 }).catch(() => fallas.push('sin vista previa'));
  const hoja = await p.textContent('[data-testid="hoja-meta"]');
  ok(hoja.includes('Viaje queda en 56%') && hoja.includes('Fondo de emergencia queda en 24%'), `no muestra cómo quedan las otras: ${hoja}`);
  await foto('m5-nueva');
  await p.click('[data-testid="meta-guardar"]');
  await p.waitForSelector('[data-testid="detalle-meta"]', { timeout: 4000 }).catch(() => fallas.push('al crear no abre el detalle'));
  ok((await p.textContent('[data-testid="detalle-meta"]')).includes('Auto'), 'no abrió la meta nueva');
  // archivar con confirmación
  await p.click('[data-testid="archivar-meta"]');
  ok(await p.isVisible('text=se reparte entre las otras metas'), 'no explica qué pasa al archivar');
  await p.click('[data-testid="archivar-meta"]');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="meta-card"]').length === 2, null, { timeout: 3000 }).catch(() => {});
  ok((await p.$$('[data-testid="meta-card"]')).length === 2, 'no quedan 2 metas tras archivar');
  ok((await p.textContent('[data-testid="reserva"]')).includes('Viaje 70%'), 'el reparto no volvió a 70/30');

  // --- Sin metas: una meta = 100%
  await p.goto(`${base}?fixtures=1&metas=0&avisos=0#metas`);
  await p.reload();
  await p.waitForSelector('[data-testid="sin-metas"]');
  ok(await p.isVisible('text=Libre para asignar'), 'sin metas no muestra lo libre');
  await p.click('[data-testid="fab-meta"]');
  ok(await p.isVisible('text=tiene el 100% de la reserva'), 'la única meta no explica el 100%');
  ok(!(await p.$('[data-testid="meta-pct"]')), 'pide % con una sola meta');
  await ctx.close();
}
await b.close();
if (errores.length) fallas.push(...errores.map((e) => 'error JS: ' + e));
console.log(fallas.length ? 'FALLAS:\n- ' + fallas.join('\n- ') : 'metas+avisos OK');
process.exit(fallas.length ? 1 : 0);
