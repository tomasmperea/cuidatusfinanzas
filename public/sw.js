// Service worker de CuidaTusFinanzas: cachea SOLO el shell de la app (HTML, JS, CSS, íconos)
// del propio origen. NUNCA cachea respuestas de la API (Supabase) ni nada de otro origen.
const CACHE = 'ctf-shell-v8';
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


// ---- Notificaciones push (avisos: solo invitan a abrir la app, nunca montos) ----
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const titulo = typeof d.title === 'string' ? d.title.slice(0, 60) : 'CuidaTusFinanzas';
  const cuerpo = typeof d.body === 'string' ? d.body.slice(0, 120) : 'Tenés avisos para revisar';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/icon-192.png',
    tag: typeof d.tag === 'string' ? d.tag : 'ctf',
    data: { url: d.url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Solo se abren direcciones de la propia app (nunca un link que venga en la notificación hacia afuera)
  let destino = self.location.origin + BASE + '#avisos';
  try {
    const u = new URL(e.notification.data && e.notification.data.url, self.location.origin);
    if (u.origin === self.location.origin && u.pathname.startsWith(BASE)) destino = u.href;
  } catch (err) { /* queda el destino por defecto */ }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) {
      if (w.url.startsWith(self.location.origin + BASE)) { w.navigate(destino); return w.focus(); }
    }
    return self.clients.openWindow(destino);
  }));
});
