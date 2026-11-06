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
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }));
}
