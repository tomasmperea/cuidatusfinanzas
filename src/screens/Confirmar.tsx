// Movimientos "a confirmar" (lectura automática), opción B:
// una franja en Caja y una hoja que los revisa de a uno. La sugerencia correcta se confirma con un toque.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Caja as CajaData, Pendiente, Subcat } from '../api';
import { fmtDiaCap, fmtExacto } from '../format';
import { Icon } from '../ui';

/** Para comparar y buscar: sin acentos ni mayúsculas. */
const plano = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const SIGLAS = new Set(['TC', 'SA', 'SRL', 'YPF', 'ACA', 'QR', 'MP', 'II', 'III']);
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en', 'a']);
function tituloLindo(t: string) {
  return t.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => {
    if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase();
    if (i > 0 && MENORES.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/** Nombre legible y una línea de detalle a partir del texto del banco (solo para mostrar: lo guardado no cambia). */
export function resumenPend(p: Pendiente, d: Pick<CajaData, 'cuentas'>): { titulo: string; tipo: string; original: string | null } {
  const raw = (p.descripcion || '').trim();
  const s = p.sugerencia;
  let titulo = raw || 'Movimiento';
  let tipo = p.signo > 0 ? 'Ingreso' : 'Débito';
  if (s.tipo === 'transferencia') {
    const dst = d.cuentas.find((c) => c.id === s.destino_id);
    titulo = dst ? `Transferencia a ${dst.nombre}` : raw;
    tipo = 'Entre tus cuentas';
  } else if (s.subcat_id === 56 && s.nota && !/^pago tc/i.test(raw)) {
    titulo = `Pago ${s.nota}`;
    tipo = /d[eé]bito autom/i.test(raw) ? 'Débito automático' : 'Pago de tarjeta';
  } else if (/^transferencia mp a /i.test(raw)) {
    titulo = raw.replace(/^transferencia mp/i, 'Transferencia'); tipo = 'Mercado Pago';
  } else if (/^transferencia /i.test(raw)) {
    tipo = p.signo > 0 ? 'Transferencia recibida' : 'Transferencia';
  } else if (/^merpago\*?\s*/i.test(raw)) {
    const resto = raw.replace(/^merpago\*?\s*/i, '');
    titulo = /^qr$/i.test(resto) ? 'Pago con QR' : tituloLindo(resto || 'Mercado Pago');
    tipo = 'Débito · Mercado Pago';
  } else if (raw) {
    titulo = tituloLindo(raw);
  }
  return { titulo, tipo, original: raw && plano(raw) !== plano(titulo) ? raw : null };
}

export function FranjaConfirmar({ n, abrir }: { n: number; abrir: () => void }) {
  return (
    <button class="franja-conf" onClick={abrir} data-testid="pendientes">
      <span class="fc-n num">{n}</span>
      <span class="fc-t">{n === 1 ? 'Movimiento para confirmar' : 'Movimientos para confirmar'}</span>
      <span class="fc-r">Revisar</span><Icon n="chev" size={18} />
    </button>
  );
}

export interface Paso { texto: string }

/** Hoja de revisión. No guarda nada por su cuenta: avisa la decisión y el padre la ejecuta. */
export function HojaConfirmar({ d, p, pos, total, enviando, error, ultimo, confirmar, descartar, editar, deshacer, cerrar }: {
  d: CajaData; p: Pendiente; pos: number; total: number; enviando: boolean; error: string; ultimo: Paso | null;
  confirmar: (subcat: number | null) => void; descartar: () => void; editar: (subcat: number | null) => void;
  deshacer: () => void; cerrar: () => void;
}) {
  const s = p.sugerencia;
  const esTrf = s.tipo === 'transferencia';
  const flujo = s.tipo;
  const [subcat, setSubcat] = useState<number | null>(s.subcat_id ?? null);
  const [otra, setOtra] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setSubcat(s.subcat_id ?? null); setOtra(false); setBusca(''); ref.current?.focus(); }, [p.id]);
  // Escape: siempre con la versión actual de cerrar (si no, se perdería lo ya confirmado)
  const alCerrar = useRef(cerrar);
  alCerrar.current = cerrar;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (otra ? setOtra(false) : alCerrar.current());
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [otra]);

  const r = resumenPend(p, d);
  const delFlujo = d.subcategorias.filter((x) => x.flujo === flujo && x.id !== 1).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // Chips rápidos: la sugerida (o la elegida) + las más usadas. "Sin categoría" y "Tarjetas" solo por "Otra…"
  const rapidas = useMemo(() => {
    const top = [...delFlujo].filter((x) => x.id !== 3 && x.id !== 2 && x.id !== 56 && (x.uso ?? 0) > 0)
      .sort((a, b) => (b.uso ?? 0) - (a.uso ?? 0));
    const fijas = [s.subcat_id, subcat].filter((x): x is number => x != null);
    const ids = [...new Set([...fijas, ...top.map((x) => x.id)])].slice(0, 3);
    return ids.map((id) => d.subcategorias.find((x) => x.id === id)).filter((x): x is Subcat => !!x);
  }, [p.id, subcat]);
  const elegida = d.subcategorias.find((x) => x.id === subcat);
  // "Tarjetas" necesita saber qué tarjeta: si no viene sugerida, se completa en Editar
  const faltaTarjeta = subcat === 56 && !s.nota;
  const destino = esTrf ? d.cuentas.find((c) => c.id === (s.destino_id ?? 101)) : undefined;
  // a una cuenta en dólares hay que cargar cuánto entró: eso va por «Editar»
  const otraMoneda = esTrf && destino?.moneda === 'USD';
  const puede = !enviando && (esTrf ? !otraMoneda : subcat != null && !faltaTarjeta);
  const filtradas = busca.trim() ? delFlujo.filter((x) => plano(x.nombre).includes(plano(busca))) : delFlujo;

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      {ultimo && (
        <div class="toast toast-arriba" role="status" data-testid="toast-paso">
          <Icon n="check" size={18} /><span>{ultimo.texto}</span>
          <button onClick={deshacer} disabled={enviando}>Deshacer</button>
        </div>
      )}
      <div class="sheet conf" role="dialog" aria-modal="true" aria-label="Confirmar movimiento" tabIndex={-1} ref={ref} data-testid="hoja-confirmar">
        <div class="grab" />
        {otra ? (
          <>
            <div class="conf-top">
              <button class="act" aria-label="Volver" onClick={() => setOtra(false)}><Icon n="atras" size={20} /></button>
              <b style="flex:1">Categoría</b>
            </div>
            <input class="nota" type="search" placeholder="Buscar categoría" aria-label="Buscar categoría" value={busca}
              onInput={(e) => setBusca((e.target as HTMLInputElement).value)} />
            <div class="cat-fila conf-todas" data-testid="conf-todas">
              {filtradas.map((x) => (
                <button class={`chip-g${subcat === x.id ? ' sel' : ''}`} aria-pressed={subcat === x.id} data-subcat={x.id}
                  onClick={() => { setSubcat(x.id); setOtra(false); }}>{x.nombre}</button>
              ))}
              {!filtradas.length && <span class="small">No hay categorías con ese nombre.</span>}
            </div>
          </>
        ) : (
          <>
            <div class="conf-top">
              <span class="small" style="flex:1;font-weight:650">{pos} de {total} para confirmar</span>
              <button class="act" aria-label="Cerrar" onClick={cerrar} data-testid="conf-cerrar"><Icon n="cerrar" size={20} /></button>
            </div>
            <div class="conf-monto num" data-testid="conf-monto">{fmtExacto(p.monto * p.signo)}</div>
            <div class="conf-titulo" data-testid="conf-titulo">{r.titulo}</div>
            <div class="small">{r.tipo} · {fmtDiaCap(p.fecha)}{p.ts ? ' · ' + p.ts.slice(11, 16) : ''}</div>
            {r.original && (
              <div class="conf-banco"><span class="eyebrow">Como lo informa el banco</span><span>{r.original}</span></div>
            )}

            {esTrf ? (
              <div class="small">Va a <b style="color:var(--fg)">{destino?.nombre ?? 'otra cuenta tuya'}</b>.
                {otraMoneda && <span class="warn"> Cargá cuánto entró en «Editar».</span>}</div>
            ) : (
              <div class="conf-cats">
                <span class={`small${subcat == null ? ' warn' : ''}`} style="font-weight:650">
                  {subcat == null ? (r.tipo.startsWith('Débito') ? 'Comercio nuevo: elegí la categoría' : 'Elegí la categoría') : 'Categoría'}
                </span>
                <div class="cat-fila" data-testid="conf-chips">
                  {rapidas.map((x) => (
                    <button class={`chip-g${subcat === x.id ? ' sel' : ''}`} aria-pressed={subcat === x.id} data-subcat={x.id}
                      onClick={() => setSubcat(x.id)}>{x.nombre}</button>
                  ))}
                  {elegida && !rapidas.some((x) => x.id === elegida.id) && (
                    <button class="chip-g sel" aria-pressed="true" data-subcat={elegida.id}>{elegida.nombre}</button>
                  )}
                  <button class="chip-g" onClick={() => setOtra(true)} data-testid="conf-otra">Otra…</button>
                </div>
                {faltaTarjeta && <span class="small warn">Para un pago de tarjeta, elegí cuál en «Editar».</span>}
              </div>
            )}

            <button class="link-btn" onClick={() => editar(subcat)} data-testid="conf-editar">
              <Icon n="lapiz" size={16} />Editar monto o nota
            </button>
            {error && <div class="msg" role="alert">{error}</div>}
            <div class="conf-acciones">
              <button class="btn sec" disabled={enviando} onClick={descartar} data-testid="conf-descartar">Descartar</button>
              <button class="btn" style="flex:1" disabled={!puede} onClick={() => confirmar(subcat)} data-testid="conf-confirmar">
                {enviando ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
