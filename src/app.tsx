import { useEffect, useState } from 'preact/hooks';
import type { Escenario } from './api';
import { BotonSalir, Desafio, Enrolar, Login, useEtapa } from './auth';
import { fmtDia, fmtMes, hoyAR } from './format';
import { Icon, SheetHost } from './ui';
import { Inicio } from './screens/Inicio';
import { Mes } from './screens/Mes';
import { Compromisos } from './screens/Compromisos';
import { Semana } from './screens/Semana';

const TABS = [
  { id: 'inicio', nombre: 'Inicio', icono: 'home' },
  { id: 'mes', nombre: 'Mes', icono: 'cal' },
  { id: 'compromisos', nombre: 'Compromisos', icono: 'card' },
  { id: 'semana', nombre: 'Semana', icono: 'doc' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function tabDeHash(): Tab {
  const h = location.hash.replace('#', '').split('/')[0];
  return (TABS.find((t) => t.id === h)?.id ?? 'inicio') as Tab;
}

export function App({ sinAuth = false }: { sinAuth?: boolean }) {
  const [etapa, refrescar] = useEtapa();
  if (sinAuth) return <Tablero />;
  if (etapa === 'cargando') return <main class="auth" aria-busy="true"><div class="small">Cargando…</div></main>;
  if (etapa === 'login') return <Login listo={refrescar} />;
  if (etapa === 'enrolar') return <Enrolar listo={refrescar} />;
  if (etapa === 'mfa') return <Desafio listo={refrescar} />;
  return <Tablero />;
}

function Tablero() {
  const [tab, setTab] = useState<Tab>(tabDeHash());
  const [esc, setEsc] = useState<Escenario>('central');
  useEffect(() => {
    const f = () => setTab(tabDeHash());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  const irA = (t: string) => { location.hash = t; scrollTo(0, 0); };
  const hoy = hoyAR();
  const diaHash = location.hash.split('/')[1];
  const head: Record<Tab, [string, string]> = {
    inicio: [`Hoy · ${fmtDia(hoy)}`, 'CuidaTusFinanzas'],
    mes: ['Mes', fmtMes(hoy)],
    compromisos: ['Compromisos', 'Próximos 90 días'],
    semana: ['Semana', 'Reporte semanal'],
  };
  return (
    <SheetHost>
      <div class="app">
        <header class="top">
          <div style="display:flex;flex-direction:column"><h1 class="disp">{head[tab][0]}</h1><div class="sub">{head[tab][1]}</div></div>
          <BotonSalir icono={<Icon n="salir" size={22} />} />
        </header>
        <main class="screen" id="contenido">
          {tab === 'inicio' && <Inicio esc={esc} setEsc={setEsc} irA={irA} />}
          {tab === 'mes' && <Mes esc={esc} setEsc={setEsc} diaInicial={diaHash} />}
          {tab === 'compromisos' && <Compromisos />}
          {tab === 'semana' && <Semana />}
        </main>
        <nav class="tabs" aria-label="Secciones">
          <div class="in">
            {TABS.map((t) => (
              <button aria-current={tab === t.id ? 'page' : undefined} onClick={() => irA(t.id)} data-tab={t.id}>
                <span class="pill"><Icon n={t.icono} size={22} /></span>{t.nombre}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </SheetHost>
  );
}
