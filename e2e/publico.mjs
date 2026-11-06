// Verifica una URL publicada: pantalla de login, manifest, service worker y 0 errores de consola.
// Uso: node e2e/publico.mjs https://tomasmperea.github.io/cuidatusfinanzas/
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://tomasmperea.github.io/cuidatusfinanzas/';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 412, height: 915 } })).newPage();
const errores = [];
p.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
p.on('pageerror', (e) => errores.push(e.message));
await p.goto(url, { waitUntil: 'networkidle' });
const login = await p.isVisible('[data-testid="login"]');
const manifest = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return null; const r = await fetch(l.href); return r.ok ? (await r.json()).name : null; });
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
const caches_ = await p.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).host); return [...new Set(out)]; });
console.log(JSON.stringify({ url, login, manifest, sw, hostsEnCache: caches_, errores }, null, 1));
await b.close();
process.exit(login && manifest && sw && errores.length === 0 ? 0 : 1);
