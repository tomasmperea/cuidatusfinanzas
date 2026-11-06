// Capturas de verificación (412×915) contra `vite dev` con ?fixtures=1.
// Uso: node e2e/capturas.mjs <url-base-dev> <carpeta-salida>   (la salida va FUERA del repo)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:5173/cuidatusfinanzas/', out = '../capturas'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errores = [];
const chicos = new Set();

async function pagina(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, colorScheme: scheme, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errores.push(`[${scheme}] ${m.text()}`));
  p.on('pageerror', (e) => errores.push(`[${scheme}] ${e.message}`));
  return p;
}
async function ir(p, q, hash) {
  await p.goto(`${base}?fixtures=1${q}#${hash}`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(300);
  // En la captura de página completa, la barra fija se ubica al pie del documento.
  await p.addStyleTag({ content: 'nav.tabs{position:absolute!important}' });
}
async function auditarTactiles(p, nombre) {
  const r = await p.$$eval('button, a, input', (els) => els.filter((e) => e.offsetParent !== null).map((e) => {
    const b = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) };
  }).filter((x) => x.h < 48 || x.w < 48));
  r.forEach((x) => chicos.add(`${nombre}: "${x.t}" ${x.w}×${x.h}`));
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png`, fullPage: true });

for (const scheme of ['light', 'dark']) {
  const s = scheme === 'light' ? 'claro' : 'oscuro';
  const p = await pagina(scheme);
  await ir(p, '', 'inicio');
  await auditarTactiles(p, 'inicio');
  await shot(p, `inicio-central-${s}`);
  if (scheme === 'light') {
    for (const e of ['conservador', 'optimista']) {
      await p.click(`[data-esc="${e}"]`); await p.waitForTimeout(400);
      await shot(p, `inicio-${e}-${s}`);
    }
    await p.click('[data-esc="central"]'); await p.waitForTimeout(300);
    // detalle de un monto (KPI liquidez)
    await p.click('[data-testid="monto"] >> nth=0'); await p.waitForSelector('[data-testid="detalle"]');
    await p.screenshot({ path: `${out}/detalle-monto-${s}.png` });
    await p.keyboard.press('Escape');
  }
  await ir(p, '', 'mes');
  await p.click('[data-fecha="2026-11-11"]'); await p.waitForTimeout(200);
  await auditarTactiles(p, 'mes');
  await shot(p, `mes-dia-seleccionado-${s}`);
  await ir(p, '', 'compromisos'); await auditarTactiles(p, 'compromisos'); await shot(p, `compromisos-${s}`);
  await ir(p, '', 'semana'); await auditarTactiles(p, 'semana'); await shot(p, `semana-${s}`);
  if (scheme === 'light') {
    await ir(p, '&error=all', 'inicio');
    await shot(p, `error-${s}`);
    await ir(p, '&backup_dias=6', 'inicio');
    await p.screenshot({ path: `${out}/backup-viejo-${s}.png`, clip: { x: 0, y: 0, width: 412, height: 200 } });
  }
  await p.context().close();
}
await browser.close();
const err = errores.filter((e) => !e.includes('net::ERR'));
console.log('errores de consola:', err.length, err.slice(0, 10));
console.log('táctiles < 48px:', [...chicos].slice(0, 40));
