import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { fmtAbrev, fmtExacto } from './format';

// ---------- Íconos (trazos propios, 24×24) ----------
const P: Record<string, ComponentChildren> = {
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7" /><path d="M9 16h5" /><path d="M9 8h3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chev: <path d="m9 6 6 6-6 6" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  est: <><circle cx="12" cy="12" r="9" stroke-dasharray="3 3" /><path d="M9 12h6" /></>,
  abierto: <><circle cx="12" cy="12" r="9" stroke-dasharray="3 3" /><path d="M12 8v4l2.5 1.5" /></>,
  casa: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  warn: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7.5v.01" /></>,
  usd: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.7.8 2.7 2.1-1.2 2.1-2.7 2.1c-1.2 0-2.2-.5-2.7-1.5" /><path d="M12 6v1.8" /><path d="M12 16.2V18" /></>,
  salir: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>,
  retry: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
};
export function Icon({ n, size = 20, color }: { n: keyof typeof P | string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{P[n]}</svg>
  );
}
export function Tri({ up, color, size = 11 }: { up: boolean; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={up ? 'M12 5 5 17h14z' : 'M12 19 5 7h14z'} fill={color} />
    </svg>
  );
}

// ---------- Datos asíncronos ----------
export type Async<T> = { data?: T; error?: string; loading: boolean; reload: () => void };
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [st, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    set((s) => ({ data: s.data, loading: true }));
    fn().then((data) => vivo && set({ data, loading: false }))
      .catch((e: unknown) => vivo && set({ error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...st, reload: useCallback(() => setN((x) => x + 1), []) };
}

export function ErrorCard({ que, error, reload }: { que: string; error?: string; reload: () => void }) {
  useEffect(() => { if (error) console.warn(`[ctf] No se pudo cargar ${que}:`, error); }, [error]);
  return (
    <section class="err" role="alert" data-testid="error" aria-label={`Error: ${que}`}>
      <div style="display:flex;gap:10px;align-items:flex-start">
        <Icon n="warn" color="var(--warn)" size={22} />
        <div>
          <div style="font-weight:650">No pudimos cargar esta sección.</div>
          <div class="small">Probá de nuevo en un rato.</div>
        </div>
      </div>
      <div><button class="btn sec" onClick={reload}><Icon n="retry" size={18} />Reintentar</button></div>
    </section>
  );
}
export function Skel({ h = 96 }: { h?: number }) {
  return <div class="skel" style={{ height: `${h}px` }} aria-hidden="true" />;
}
/** Renderiza hijos con datos, o el esqueleto / error. */
export function Load<T>({ a, que, h, children }: { a: Async<T>; que: string; h?: number; children: (d: T) => ComponentChildren }) {
  if (a.error) return <ErrorCard que={que} error={a.error} reload={a.reload} />;
  if (a.data === undefined) return <Skel h={h} />;
  return <>{children(a.data)}</>;
}

// ---------- Hoja de detalle (monto exacto) ----------
export type Detalle = { titulo: string; monto: number; extra?: Array<[string, string]>; nota?: string; usd?: string };
const SheetCtx = createContext<(d: Detalle) => void>(() => {});
export const useDetalle = () => useContext(SheetCtx);

export function SheetHost({ children }: { children: ComponentChildren }) {
  const [d, setD] = useState<Detalle | null>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const abrir = useCallback((x: Detalle) => { prevFocus.current = document.activeElement as HTMLElement; setD(x); }, []);
  const cerrar = useCallback(() => { setD(null); prevFocus.current?.focus?.(); }, []);
  useEffect(() => {
    if (!d) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [d]);
  return (
    <SheetCtx.Provider value={abrir}>
      {children}
      {d && (
        <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t" data-testid="detalle">
            <div class="grab" />
            <div class="eyebrow" id="sheet-t">{d.titulo}</div>
            {Number.isFinite(d.monto) && <div class="disp big num" data-testid="monto-exacto">{fmtExacto(d.monto)}</div>}
            {d.usd && <div class="num muted">{d.usd}</div>}
            {d.extra && d.extra.length > 0 && (
              <dl class="num">{d.extra.map(([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>)}</dl>
            )}
            {d.nota && <div class="small">{d.nota}</div>}
            <button ref={closeRef} class="btn sec" onClick={cerrar} style="margin-top:6px">Cerrar</button>
          </div>
        </div>
      )}
    </SheetCtx.Provider>
  );
}

/** Monto abreviado tocable: abre el detalle con el exacto. */
export function Monto({ n, titulo, extra, nota, cls = '', signoMas, children, usd }: {
  n: number; titulo: string; extra?: Detalle['extra']; nota?: string; cls?: string; signoMas?: boolean; children?: ComponentChildren; usd?: string;
}) {
  const abrir = useDetalle();
  return (
    <button class={`num ${cls}`} style="min-height:48px;min-width:48px;display:inline-flex;align-items:center;white-space:nowrap"
      aria-label={`${titulo}: ${fmtExacto(n)}. Ver detalle`} data-testid="monto"
      onClick={() => abrir({ titulo, monto: n, extra, nota, usd })}>
      {fmtAbrev(n, { signoMas })}{children}
    </button>
  );
}

// ---------- Origen del compromiso ----------
export function OrigenChip({ origen, estado, base }: { origen: string; estado?: string; base?: string }) {
  if (origen === 'resumen_confirmado') return <span class="chip conf"><Icon n="check" size={14} />Resumen confirmado</span>;
  if (origen === 'fijo_estimado') return <span class="chip fijo"><Icon n="casa" size={14} />{base?.includes('icl') ? 'Fijo · con ICL' : 'Fijo'}</span>;
  if (origen === 'recurrente_estimado') return <span class="chip"><Icon n="est" size={14} />Recurrente estimado</span>;
  if (origen === 'expenless') return <span class="chip conf"><Icon n="check" size={14} />Real</span>;
  if (estado === 'anunciado') return <span class="chip"><Icon n="abierto" size={14} />Resumen abierto · estimado</span>;
  return <span class="chip"><Icon n="est" size={14} />Estimado</span>;
}
