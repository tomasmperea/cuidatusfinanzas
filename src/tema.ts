// Tema visual: por defecto sigue al sistema del teléfono. El botón luna/sol lo cambia cuando Tomás quiera;
// si elige el mismo tema que tiene el sistema, vuelve a seguir al sistema. Se guarda solo en este dispositivo.
export type Tema = 'oscuro' | 'claro';
const CLAVE = 'ctf-tema';
const BARRA: Record<Tema, string> = { oscuro: '#14121A', claro: '#F7F4EF' };
const mq = () => matchMedia('(prefers-color-scheme: light)');

export const temaSistema = (): Tema => (mq().matches ? 'claro' : 'oscuro');
function forzado(): Tema | null {
  try { const v = localStorage.getItem(CLAVE); return v === 'claro' || v === 'oscuro' ? v : null; } catch { return null; }
}
export const temaActual = (): Tema => forzado() ?? temaSistema();

function pintar() {
  const f = forzado();
  if (f) document.documentElement.dataset.tema = f; else delete document.documentElement.dataset.tema;
  const t = temaActual();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BARRA[t]));
}

/** Cambia al otro tema. Si coincide con el del sistema, se borra la elección y vuelve a seguirlo. */
export function alternarTema(): Tema {
  const nuevo: Tema = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  try { if (nuevo === temaSistema()) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, nuevo); } catch { /* solo esta sesión */ }
  pintar();
  return nuevo;
}

/** Al arrancar y cada vez que el sistema cambia de tema. */
export function iniciarTema(alCambiar?: () => void) {
  pintar();
  mq().addEventListener('change', () => { pintar(); alCambiar?.(); });
}
