// Service worker de CuidaTusFinanzas: cachea SOLO el shell de la app (HTML, JS, CSS, íconos)
// del propio origen. NUNCA cachea respuestas de la API (Supabase) ni nada de otro origen.
const CACHE = 'ctf-shell-v4';
const BASE = new URL('./', self.location).pathname; // /cuidatusfinanzas/
const SHELL = [BASE, BASE + 'manifest.webmanifest', BASE + 'icons/icon-192.png', BASE + 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function esShell(url) {
  if (url.origin !== self.location.origin) return false; // la API está en otro origen: no se toca
  if (!url.pathname.startsWith(BASE)) return false;
  return url.pathname === BASE || url.pathname.endsWith('.html') || url.pathname.startsWith(BASE + 'assets/') ||
    url.pathname.startsWith(BASE + 'icons/') || url.pathname.endsWith('.webmanifest');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!esShell(url)) return; // red directa, sin caché
  if (req.mode === 'navigate') {
    // Red primero para el HTML (así llegan las versiones nuevas); caché si no hay conexión.
    // cache: 'no-store' evita que la caché HTTP del navegador devuelva un HTML viejo.
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(BASE, c)); } return r; })
      .catch(() => caches.match(BASE)));
    return;
  }
  // Archivos con hash: caché primero.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)); }
    return r;
  })));
});

