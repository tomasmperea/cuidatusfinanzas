// Tema visual: "Expresivo oscuro" por defecto, "claro" a elección. Se guarda solo en este dispositivo.
export type Tema = 'oscuro' | 'claro';
const CLAVE = 'ctf-tema';
const BARRA: Record<Tema, string> = { oscuro: '#14121A', claro: '#F7F4EF' };

export function leerTema(): Tema {
  try { return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro'; } catch { return 'oscuro'; }
}

export function aplicarTema(t: Tema) {
  const html = document.documentElement;
  if (t === 'claro') html.dataset.tema = 'claro'; else delete html.dataset.tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BARRA[t]);
  try { localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento: vale para esta sesión */ }
}
