// Fase 14: movimientos a confirmar, opción B (franja + revisión de a uno). Datos sintéticos (?fixtures=1).
// Uso: node e2e/confirmar.mjs <url-base-dev> [carpeta-capturas]
import { chromium } from 'playwright';
const [base = 'http://localhost:5173/cuidatusfinanzas/', out] = process.argv.slice(2);
const b = await chromium.launch();
const fallas = [], errores = [];
const ok = (c, m) => { if (!c) fallas.push(m); };
const T = (sel) => '[data-testid="' + sel + '"]';

for (const scheme of ['light', 'dark']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  const foto = async (n) => { if (out) await p.screenshot({ path: `${out}/${n}-${scheme}.png` }); };
  const texto = async (sel) => ((await p.textContent(T(sel))) ?? '').replace(/\s+/g, ' ').trim();
  const liquidez = async () => texto('liquidez-valor');

  // --- 1. Entrada por el push: #caja/confirmar abre la hoja directo, sin tocar la franja
  await p.goto(`${base}?fixtures=1#caja/confirmar`);
  await p.waitForSelector(T('hoja-confirmar'), { timeout: 8000 }).catch(() => fallas.push('el link del push no abre la revisión'));
  ok(await p.evaluate(() => location.hash === '#caja'), 'el link del push no se limpia (atrás la reabriría)');
  ok((await texto('hoja-confirmar')).includes('1 de 2 para confirmar'), 'no muestra 1 de 2');
  const liq0 = await liquidez();

  // Movimiento 1: transferencia sin categoría → Confirmar apagado hasta elegir
  ok((await texto('conf-titulo')) === 'Transferencia a …0337', `título de la transferencia: ${await texto('conf-titulo')}`);
  ok(await p.isDisabled(T('conf-confirmar')), 'deja confirmar sin categoría');
  ok((await texto('hoja-confirmar')).includes('Elegí la categoría') && !(await texto('hoja-confirmar')).includes('Comercio nuevo'), 'texto de categoría en una transferencia');
  await foto('c1-mov1');

  // "Otra…": busca y vuelve a la misma hoja con la elegida
  await p.click(T('conf-otra'));
  await p.fill('input[type="search"]', 'peluq');
  ok((await p.locator(`${T('conf-todas')} button`).count()) === 1, 'el buscador no filtra');
  await p.click(`${T('conf-todas')} [data-subcat="19"]`);
  ok((await p.getAttribute(`${T('conf-chips')} [data-subcat="19"]`, 'aria-pressed')) === 'true', 'no vuelve con la categoría elegida');
  ok(!(await p.isDisabled(T('conf-confirmar'))), 'con categoría sigue sin dejar confirmar');

  // Confirmar → pasa solo al 2, con aviso y Deshacer
  await p.click(T('conf-confirmar'));
  await p.waitForSelector(T('toast-paso'));
  ok((await texto('toast-paso')).startsWith('Confirmado: Transferencia a …0337'), 'aviso del paso');
  ok((await texto('hoja-confirmar')).includes('2 de 2 para confirmar'), 'no pasó al 2');

  // Movimiento 2: débito de MP con sugerencia → nombre limpio y categoría ya elegida
  ok((await texto('conf-titulo')) === 'Cafe de Prueba', `nombre limpio: ${await texto('conf-titulo')}`);
  ok((await texto('hoja-confirmar')).includes('Débito · Mercado Pago'), 'tipo del débito');
  ok((await texto('hoja-confirmar')).includes('MERPAGO CAFE DE PRUEBA'), 'falta el texto original del banco');
  ok((await p.getAttribute(`${T('conf-chips')} [data-subcat="24"]`, 'aria-pressed')) === 'true', 'la sugerida no viene elegida');
  await foto('c2-mov2');

  // Deshacer dentro de la hoja vuelve al 1
  await p.click(`${T('toast-paso')} button`);
  await p.waitForFunction(() => document.querySelector('[data-testid="hoja-confirmar"]')?.textContent?.includes('1 de 2'));
  ok(!(await p.$(T('toast-paso'))), 'tras deshacer sigue el aviso');

  // Editar → calculadora con "Guardar y seguir" → vuelve en el siguiente
  await p.click(T('conf-editar'));
  await p.waitForSelector(T('hoja-registro'));
  ok(await p.isVisible(T('categorias')), 'sin categoría, la calculadora no pide categoría');
  await p.click(`${T('categorias')} [data-subcat="3"]`);
  ok((await texto('guardar')) === 'Guardar y seguir', 'el botón de la calculadora no dice Guardar y seguir');
  await p.click('[data-k="del"]');                       // 47.300 → 4.730
  await p.click(T('guardar'));
  await p.waitForSelector(T('hoja-confirmar'));
  ok((await texto('hoja-confirmar')).includes('2 de 2'), 'después de editar no siguió con el 2');

  // Descartar el 2 → termina, vuelve a Caja con resumen y resalta lo confirmado
  await p.click(T('conf-descartar'));
  await p.waitForSelector(T('toast'));
  ok(!(await p.$(T('hoja-confirmar'))), 'la hoja no se cerró al terminar');
  ok((await texto('toast')).startsWith('Listo: 1 confirmado y 1 descartado'), `resumen final: ${await texto('toast')}`);
  ok(!(await p.$(T('pendientes'))), 'la franja sigue con 0 pendientes');
  await p.waitForTimeout(300);
  ok((await p.locator('.mv.recien').count()) === 1, 'no resalta el movimiento confirmado');
  ok((await liquidez()) !== liq0, 'la liquidez no se actualizó');
  await foto('c3-final');

  // Deshacer todo
  await p.click(`${T('toast')} button`);
  await p.waitForSelector(T('pendientes'));
  ok((await texto('pendientes')).includes('2'), 'deshacer todo no devuelve los 2 pendientes');
  await p.waitForFunction((v) => document.querySelector('[data-testid="liquidez-valor"]')?.textContent?.trim() === v, liq0, { timeout: 3000 })
    .catch(() => fallas.push('deshacer todo no restaura la liquidez'));

  // --- 2. Entrada por la franja; confirmar 1 y cerrar a mitad de camino
  await p.click(T('pendientes'));
  await p.waitForSelector(T('hoja-confirmar'));
  await p.click(`${T('conf-chips')} [data-subcat="48"]`);
  await p.click(T('conf-confirmar'));
  await p.waitForSelector(T('toast-paso'));
  await p.keyboard.press('Escape');
  await p.waitForSelector(T('toast'));
  ok((await texto('toast')).startsWith('Listo: 1 confirmado'), 'cerrar a mitad no resume lo hecho');
  ok((await texto('pendientes')).includes('1'), 'cerrar a mitad no deja el pendiente restante');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'desborde horizontal');
  await ctx.close();
}
await b.close();
if (errores.length) fallas.push('errores JS: ' + errores.join(' | '));
console.log(fallas.length ? 'FALLAS:\n- ' + fallas.join('\n- ') : 'OK confirmar');
process.exit(fallas.length ? 1 : 0);
