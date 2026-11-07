import { render } from 'preact';
import { App } from './app';
import './styles.css';

async function arrancar() {
  let sinAuth = false;
  // Modo de desarrollo con datos de prueba: existe solo en `vite dev` (el bloque se elimina del build).
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.has('fixtures')) {
      const m = await import('./dev-fixtures');
      m.activarFixtures(q);
      sinAuth = true;
    }
  }
  render(<App sinAuth={sinAuth} />, document.getElementById('app')!);
}
arrancar();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Al volver a la app (la PWA queda viva en segundo plano en Android) se busca una versión nueva;
  // cuando el service worker nuevo toma el control, se recarga una vez para mostrarla.
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargado) return;
    recargado = true;
    location.reload();
  });
  addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL, updateViaCache: 'none' });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  });
}
