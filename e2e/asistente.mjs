// Asistente (diseño A): botón en Inicio → hoja de chat → pregunta con opciones → veredicto con tarjeta. Datos sintéticos.
// Uso: node e2e/asistente.mjs <url-base-dev> [carpeta-capturas]
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/', out] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
for (const scheme of ['dark', 'light']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${base}?fixtures=1#inicio`);
  await p.waitForSelector('[data-testid="fab-asistente"]', { timeout: 8000 }).catch(() => fallas.push('no aparece el botón'));
  if (out && scheme === 'dark') await p.screenshot({ path: `${out}/asis-1-inicio.png` });
  await p.click('[data-testid="fab-asistente"]');
  await p.waitForSelector('[data-testid="hoja-asistente"]');
  ok(await p.evaluate(() => document.activeElement?.id === 'asis-in'), 'el foco no está en el campo');
  ok(await p.isDisabled('[data-testid="asis-enviar"]'), 'enviar habilitado sin texto');
  await p.fill('[data-testid="asis-input"]', 'Quiero cambiar la moto, 36 cuotas de 300 mil');
  await p.click('[data-testid="asis-enviar"]');
  await p.waitForSelector('.burb.preg', { timeout: 5000 }).catch(() => fallas.push('no llegó la pregunta'));
  ok((await p.$$('.burb.preg')).length === 2, 'faltan las 2 preguntas');
  if (out && scheme === 'dark') await p.screenshot({ path: `${out}/asis-2-pregunta.png` });
  await p.click('.burb.preg >> nth=0 >> text=No');
  ok(!(await p.isVisible('[data-testid="veredicto"]')), 'mandó antes de contestar las 2');
  await p.click('.burb.preg >> nth=1 >> text=El mes que viene');
  await p.waitForSelector('[data-testid="veredicto"]', { timeout: 5000 }).catch(() => fallas.push('no llegó el veredicto'));
  const yo = await p.$$eval('.burb.yo', (e) => e.map((x) => x.textContent));
  ok(yo[1]?.includes('No') && yo[1]?.includes('El mes que viene'), `respuesta combinada incorrecta: ${yo[1]}`);
  const card = await p.textContent('[data-testid="veredicto"]');
  ok(card.includes('Ajustado') && card.includes('39 meses'), 'tarjeta sin veredicto u horizonte');
  ok(card.includes('Días bajo el piso') && card.includes('9,6%'), 'faltan datos en la tarjeta');
  ok(await p.isVisible('.asis-graf'), 'falta el gráfico');
  ok((await p.textContent('[data-testid="uso"]')).includes('/30'), 'falta el contador de consultas');
  await p.click('[data-testid="guardar"]');
  await p.waitForSelector('[data-testid="guardar"][aria-pressed="true"]', { timeout: 3000 }).catch(() => fallas.push('no marcó guardado'));
  // sin desborde horizontal
  ok(await p.evaluate(() => { const l = document.querySelector('.asis-lista'); return l.scrollWidth <= l.clientWidth + 1; }), 'desborde horizontal en el chat');
  if (out) await p.screenshot({ path: `${out}/asis-3-veredicto-${scheme}.png` });
  await p.click('.asis-sup summary');
  if (out && scheme === 'dark') { await p.evaluate(() => { const l = document.querySelector('.asis-lista'); l.scrollTop = l.scrollHeight; }); await p.screenshot({ path: `${out}/asis-4-supuestos.png` }); }
  // cerrar y reabrir mantiene la conversación
  await p.keyboard.press('Escape');
  ok(!(await p.isVisible('[data-testid="hoja-asistente"]')), 'Escape no cerró');
  await p.click('[data-testid="fab-asistente"]');
  ok(await p.isVisible('[data-testid="veredicto"]'), 'se perdió la conversación al reabrir');
  await p.click('[data-testid="nueva"]');
  ok(!(await p.isVisible('[data-testid="veredicto"]')), 'Nueva no limpió');
  // ojito: oculta montos de la tarjeta
  await ctx.close();
}
// ojito + error
{
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${base}?fixtures=1&asis=error#inicio`);
  await p.click('[data-testid="ojito"]');
  await p.click('[data-testid="fab-asistente"]');
  await p.fill('[data-testid="asis-input"]', 'Un viaje de $500.000');
  await p.click('[data-testid="asis-enviar"]');
  await p.waitForSelector('.burb.err', { timeout: 5000 }).catch(() => fallas.push('no muestra el error'));
  ok((await p.textContent('.burb.err')).includes('máximo'), 'texto de error incorrecto');
  ok(!(await p.textContent('.burb.yo')).includes('500.000'), 'el ojito no tapó el monto en el chat');
}
await b.close();
console.log(JSON.stringify({ fallas, errores }));
