// Metas de ahorro (diseño A): tarjeta en Inicio → pantalla Metas → detalle.
// Regla: las metas se reparten el 100% de la reserva (Fondos + dólares al oficial compra); con una sola meta, tiene el 100%.
// El avance = % de la meta × reserva actual. Todos los números salen de la base (rpc_metas / rpc_meta_simular).
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type Meta, type MetaInput, type MetaSim, type Metas } from '../api';
import { fmtAbrev, fmtDDMM, fmtExacto, fmtUSD, nombreMes, sumarDias } from '../format';
import { Icon, Load, Monto, Skel, type Async } from '../ui';
import { HojaAsistente } from './Asistente';
import { avisosCambiaron } from './Avisos';
import { irACajaCon } from '../app';

const mesCorto = (iso: string) => `${nombreMes(iso).slice(0, 3)} ${iso.slice(2, 4)}`;
const mesLargo = (iso: string) => `${nombreMes(iso)} ${iso.slice(0, 4)}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const ver = (n: number) => fmtAbrev(n, { ver: true });

const ESTADO: Record<string, { txt: string; cls: string }> = {
  en_camino: { txt: 'En camino', cls: 'good' }, atrasada: { txt: 'Atrasada', cls: 'warn' }, en_riesgo: { txt: 'En riesgo', cls: 'warn' },
  cumplida: { txt: 'Cumplida', cls: 'good' }, vencida: { txt: 'Vencida', cls: 'warn' },
};

/** Una línea que dice qué hacer con la meta. */
function lineaEstado(m: Meta): string {
  switch (m.estado) {
    case 'cumplida': return 'Cumplida. Archivala cuando uses la plata.';
    case 'vencida': return `Venció el ${fmtDDMM(m.fecha_objetivo)} sin completarse`;
    case 'atrasada': return m.aporte_reserva_mes ? `Atrasada: sumá ${fmtAbrev(m.aporte_reserva_mes)} por mes a la reserva` : 'Atrasada';
    case 'en_riesgo': return `La proyección no llega a ${mesCorto(m.fecha_objetivo)}`;
    default:
      if (m.fecha_estimada && m.fecha_estimada <= m.fecha_objetivo) return `A este ritmo llegás · ${mesCorto(m.fecha_estimada)}`;
      return m.aporte_reserva_mes ? `Sumá ${fmtAbrev(m.aporte_reserva_mes)} por mes a la reserva` : 'En camino';
  }
}

function Barra({ v, warn }: { v: number; warn?: boolean }) {
  return <div class="barra" aria-hidden="true"><i class={warn ? 'warn-bg' : ''} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></div>;
}

// ---------- Datos con caché: al volver a una pantalla se muestra lo último al instante y se actualiza por detrás
// (sin esto, la tarjeta de Inicio aparecía tarde y empujaba las de abajo)
let cacheMetas: Metas | undefined;
function useMetas(n = 0): Async<Metas> {
  const [st, set] = useState<{ data?: Metas; error?: string; loading: boolean }>({ data: cacheMetas, loading: true });
  const [k, setK] = useState(0);
  useEffect(() => {
    let vivo = true;
    api.metas().then((d) => { cacheMetas = d; if (vivo) set({ data: d, loading: false }); })
      .catch((e: unknown) => vivo && set((x) => (x.data ? { ...x, loading: false } : { error: e instanceof Error ? e.message : String(e), loading: false })));
    return () => { vivo = false; };
  }, [n, k]);
  return { ...st, reload: () => setK((x) => x + 1) };
}

// ---------- Tarjeta en Inicio ----------
export function TarjetaMetas({ irA }: { irA: (t: string) => void }) {
  const m = useMetas();
  if (m.error) return null;   // no es crítica: si falla, Inicio sigue igual
  if (!m.data) return <Skel h={132} />;   // reserva el lugar para que las tarjetas de abajo no salten
  const metas = m.data.metas;
  if (metas.length === 0) {
    return (
      <section class="card" aria-label="Metas" data-testid="metas-vacia" style="gap:4px">
        <div class="cardhead"><h2>Metas</h2><button class="linkbtn" onClick={() => irA('metas')}>Crear una meta</button></div>
        <div class="small">Poné un objetivo de ahorro y te digo si llegás con tu proyección.</div>
      </section>
    );
  }
  return (
    <section class="card" aria-label="Metas" data-testid="tarjeta-metas" style="gap:8px">
      <div class="cardhead"><h2>Metas</h2><button class="linkbtn" onClick={() => irA('metas')}>Ver todas</button></div>
      {metas.slice(0, 3).map((x) => (
        <button class="meta-fila" onClick={() => irA(`metas/${x.id}`)} data-testid="meta-fila"
          aria-label={`${x.nombre}: ${Math.round(x.avance_pct)}% de ${fmtExacto(x.objetivo)}. ${lineaEstado(x)}`}>
          <span class="meta-fila-top" aria-hidden="true"><b class="ell">{x.nombre}</b><span class="num">{Math.round(x.avance_pct)}%</span></span>
          <Barra v={x.avance_pct} warn={x.estado === 'atrasada' || x.estado === 'en_riesgo' || x.estado === 'vencida'} />
          <span class={`small ${ESTADO[x.estado]?.cls === 'warn' ? 'warn' : ''}`} aria-hidden="true">{lineaEstado(x)}</span>
        </button>
      ))}
    </section>
  );
}

// ---------- Pantalla Metas (lista o detalle) ----------
export function PantallaMetas({ id, irA }: { id: number | null; irA: (t: string) => void }) {
  const [n, setN] = useState(0);
  const d = useMetas(n);
  const [hoja, setHoja] = useState<null | { meta?: Meta }>(null);
  const recargar = () => { setN((x) => x + 1); avisosCambiaron(); };
  return (
    <>
      <Load a={d} que="las metas" h={360}>
        {(m) => {
          const meta = id != null ? m.metas.find((x) => x.id === id) : undefined;
          if (id != null && !meta) return <section class="card"><div class="small">Esa meta ya no está activa.</div><button class="linkbtn" onClick={() => irA('metas')}>Ver metas</button></section>;
          return meta ? <DetalleMeta m={m} meta={meta} editar={() => setHoja({ meta })} recargar={recargar} irA={irA} />
            : <ListaMetas m={m} recargar={recargar} irA={irA} />;
        }}
      </Load>
      {id == null && (
        <button class="fab" aria-label="Nueva meta" data-testid="fab-meta" onClick={() => setHoja({})}><Icon n="plus" size={28} /></button>
      )}
      {hoja && d.data && <HojaMeta m={d.data} meta={hoja.meta} cerrar={() => setHoja(null)} listo={(nuevoId) => { setHoja(null); recargar(); if (nuevoId && !hoja.meta) irA(`metas/${nuevoId}`); }} />}
    </>
  );
}

function TarjetaReserva({ m }: { m: Metas }) {
  const r = m.reserva;
  const sinMetas = m.metas.length === 0;
  return (
    <section class="card" aria-label="Reserva" data-testid="reserva" style="gap:6px">
      <div class="eyebrow">Reserva</div>
      <div><Monto n={r.total} titulo="Reserva (Fondos + dólares)" cls="disp big"
        extra={[['Fondos', fmtExacto(r.fondos_ars)], ['Dólares', `${fmtUSD(r.usd)} · ${fmtExacto(r.usd_en_ars)}`],
          ['Cotización', r.cotizacion ? `${fmtExacto(r.cotizacion)} (${r.cotizacion_tipo}${r.cotizacion_fecha ? ', ' + fmtDDMM(r.cotizacion_fecha) : ''})` : 'sin dato']]} /></div>
      <div class="kv-lin num small"><span>Fondos {fmtAbrev(r.fondos_ars)}</span><span>Dólares {fmtUSD(r.usd)}</span></div>
      {sinMetas
        ? <div class="kv-lin"><span>Libre para asignar</span><b class="num">{fmtAbrev(r.total)}</b></div>
        : <div class="split" aria-label="Reparto de la reserva entre metas">
            {m.metas.map((x, i) => <i style={{ flex: x.pct, opacity: 1 - i * 0.18 }} title={`${x.nombre} ${pct(x.pct)}`} />)}
          </div>}
      {!sinMetas && <div class="small">{m.metas.map((x) => `${x.nombre} ${pct(x.pct)}`).join(' · ')}</div>}
      {r.cotizacion_vieja && <div class="small warn">La cotización del dólar tiene más de 5 días.</div>}
      <div class="small">Lo apartado sigue contando en tu liquidez. Si un valle te obliga a usarlo, te aviso.</div>
      {m.valle.toca_metas && <div class="small warn" role="status" data-testid="valle-metas">
        El {fmtDDMM(m.valle.fecha)} tu liquidez baja a {fmtAbrev(m.valle.minimo)}: tendrías que usar plata de metas.</div>}
    </section>
  );
}

function ListaMetas({ m, recargar, irA }: { m: Metas; recargar: () => void; irA: (t: string) => void }) {
  const [verArch, setVerArch] = useState(false);
  const [msg, setMsg] = useState('');
  const reactivar = async (id: number) => {
    setMsg('');
    try { await api.metaEstado(id, 'activa'); recargar(); } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo'); }
  };
  return (
    <>
      <TarjetaReserva m={m} />
      {m.metas.length === 0 && <div class="pad small" data-testid="sin-metas">Todavía no tenés metas. Creá una con el botón +.</div>}
      {m.metas.map((x) => (
        <button class="card meta-card" onClick={() => irA(`metas/${x.id}`)} data-testid="meta-card"
          aria-label={`${x.nombre}, ${mesLargo(x.fecha_objetivo)}: ${fmtExacto(x.avance)} de ${fmtExacto(x.objetivo)}. ${lineaEstado(x)}`}>
          <span class="meta-fila-top" aria-hidden="true"><b class="ell">{x.nombre}</b><span class="small">{mesCorto(x.fecha_objetivo)}</span></span>
          <span class="meta-fila-top num" aria-hidden="true"><span>{fmtAbrev(x.avance)} de {fmtAbrev(x.objetivo)}</span><b>{Math.round(x.avance_pct)}%</b></span>
          <Barra v={x.avance_pct} warn={ESTADO[x.estado]?.cls === 'warn'} />
          <span class={`small ${ESTADO[x.estado]?.cls === 'warn' ? 'warn' : ''}`} aria-hidden="true">{lineaEstado(x)}</span>
        </button>
      ))}
      {m.archivadas.length > 0 && (
        <div class="pad">
          <button class="linkbtn" aria-expanded={verArch} onClick={() => setVerArch(!verArch)}>{verArch ? 'Ocultar archivadas' : `Archivadas (${m.archivadas.length})`}</button>
          {verArch && <ul class="rows">{m.archivadas.map((a) => (
            <li class="fila1"><span class="ell">{a.nombre}</span><span class="small num">{fmtAbrev(a.objetivo)}</span>
              <button class="linkbtn" onClick={() => reactivar(a.id)}>Reactivar</button></li>))}</ul>}
          {msg && <div class="small warn" role="alert">{msg}</div>}
        </div>
      )}
    </>
  );
}

// ---------- Detalle ----------
function DetalleMeta({ m, meta, editar, recargar, irA }: { m: Metas; meta: Meta; editar: () => void; recargar: () => void; irA: (t: string) => void }) {
  const [preguntar, setPreguntar] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const e = ESTADO[meta.estado];
  const p = meta.proyeccion;
  const hist = m.historial[String(meta.id)] ?? [];
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const archivar = async () => {
    if (!confirmarArchivo) { setConfirmarArchivo(true); return; }
    try { await api.metaEstado(meta.id, 'archivada'); recargar(); irA('metas'); } catch (er) { setMsg(er instanceof Error ? er.message : 'No se pudo'); }
  };
  const textoPreg = `Mi meta es juntar ${ver(meta.objetivo)} para ${mesLargo(meta.fecha_objetivo)}. Llevo ${ver(meta.avance)} (${pct(meta.pct)} de mi reserva). ¿Qué me conviene hacer para llegar?`;
  return (
    <>
      <section class="card" aria-label={`Meta ${meta.nombre}`} data-testid="detalle-meta" style="gap:8px">
        <div class="cardhead">
          <h2 class="ell">{meta.nombre}</h2>
          <span class={`chip ${e.cls === 'warn' ? 'chip-warn' : 'conf'}`}>{e.txt}</span>
        </div>
        <div class="small">Objetivo {fmtAbrev(meta.objetivo)} · {mesLargo(meta.fecha_objetivo)} · {pct(meta.pct)} de la reserva</div>
        <GraficoMeta meta={meta} hist={hist} hoy={m.hoy} />
        <div class="kpis3">
          <div><div class="eyebrow">Apartado</div><Monto n={meta.avance} titulo="Apartado para la meta" cls="disp" extra={[['% de la reserva', pct(meta.pct)], ['Reserva total', fmtExacto(m.reserva.total)]]} /></div>
          <div><div class="eyebrow">Falta</div><Monto n={meta.falta} titulo="Falta para la meta" cls="disp" /></div>
          <div><div class="eyebrow">Por mes</div>{meta.aporte_reserva_mes != null
            ? <Monto n={meta.aporte_reserva_mes} titulo="Sumar a la reserva por mes" cls="disp"
                nota={meta.pct < 1 ? `Esta meta recibe el ${pct(meta.pct)} de la reserva: para que le lleguen ${fmtExacto(meta.necesario_mes)} por mes, la reserva tiene que crecer ${fmtExacto(meta.aporte_reserva_mes)}.` : undefined} />
            : <span class="disp">—</span>}</div>
        </div>
      </section>

      <section class="card" aria-label="Pronóstico" data-testid="pronostico" style="gap:6px">
        <h2>Pronóstico</h2>
        {p.llega != null && (
          <div class={`small ${p.llega ? '' : 'warn'}`}>
            {p.llega ? 'Con la proyección central llegás: ' : 'Con la proyección central no llegás: '}
            en {mesLargo(meta.fecha_objetivo)} te quedan {fmtAbrev(p.margen_sobre_piso)} sobre el piso y tus metas necesitan {fmtAbrev(p.necesitas_apartado)} apartados.
          </div>
        )}
        <div class="small">
          {m.ritmo_reserva_mes > 0
            ? `En los últimos 90 días la reserva creció ${fmtAbrev(m.ritmo_reserva_mes)} por mes; a esta meta le tocan ${fmtAbrev(meta.ritmo_mes)}.` +
              (meta.fecha_estimada ? ` A ese ritmo la completás en ${mesLargo(meta.fecha_estimada)}.` : '')
            : 'En los últimos 90 días la reserva no creció: para avanzar, pasá plata a Fondos o Dólares.'}
        </div>
      </section>

      {m.movimientos_reserva.length > 0 && (
        <section class="card" aria-label="Movimientos de la reserva" style="gap:4px">
          <h2>Movimientos de la reserva</h2>
          <ul class="rows">{m.movimientos_reserva.slice(0, 8).map((x) => (
            <li class="fila1">
              <span class="num muted" style="flex:none;width:48px">{fmtDDMM(x.fecha)}</span>
              <span class="ell">{x.titulo}</span>
              <span class={`num ${x.monto >= 0 ? 'good' : ''}`}>{x.moneda === 'USD' ? fmtUSD(x.monto) : fmtAbrev(x.monto, { signoMas: true })}</span>
            </li>))}</ul>
          <div class="small">A esta meta le toca el {pct(meta.pct)} de cada movimiento.</div>
        </section>
      )}

      <div class="pad acciones-meta">
        <button class="btn" onClick={() => irACajaCon('transferencia')} data-testid="apartar"><Icon n="flechas" size={18} />Apartar ahora</button>
        <button class="btn sec" onClick={() => setPreguntar(textoPreg)} data-testid="preguntar-meta"><Icon n="chispa" size={18} />Preguntar al asistente</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip-g" onClick={editar} data-testid="editar-meta"><Icon n="lapiz" size={16} />Editar</button>
          <button class="chip-g" onClick={archivar} data-testid="archivar-meta">{confirmarArchivo ? 'Tocá de nuevo para archivar' : 'Archivar'}</button>
          <button class="chip-g" onClick={() => irA('metas')}>Todas las metas</button>
        </div>
        {confirmarArchivo && <div class="small">Al archivarla, su {pct(meta.pct)} de la reserva se reparte entre las otras metas. No se borra: la podés reactivar.</div>}
        {msg && <div class="small warn" role="alert">{msg}</div>}
      </div>
      {preguntar && <HojaAsistente inicial={preguntar} cerrar={() => setPreguntar(null)} />}
    </>
  );
}

function GraficoMeta({ meta, hist, hoy }: { meta: Meta; hist: Array<{ fecha: string; avance: number }>; hoy: string }) {
  const W = 320, H = 120, P = 6;
  const t = (iso: string) => Date.parse(iso + 'T00:00:00Z');
  const x0 = Math.min(t(meta.base_fecha), t(meta.creada), ...hist.map((h) => t(h.fecha)));
  const x1 = Math.max(t(meta.fecha_objetivo), x0 + 86400000);
  const ymax = Math.max(meta.objetivo, ...hist.map((h) => h.avance), meta.avance) * 1.05 || 1;
  const X = (iso: string) => P + ((t(iso) - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = (v: number) => H - P - (v / ymax) * (H - 2 * P);
  const puntos = [...hist.filter((h) => h.fecha < hoy), { fecha: hoy, avance: meta.avance }];
  const real = puntos.map((h, i) => `${i ? 'L' : 'M'}${X(h.fecha).toFixed(1)},${Y(h.avance).toFixed(1)}`).join(' ');
  // avance al inicio del plan, despejado de lo esperado a hoy (plan lineal entre base_fecha y la fecha objetivo)
  const f = (t(hoy) - t(meta.base_fecha)) / Math.max(t(meta.fecha_objetivo) - t(meta.base_fecha), 1);
  const y0 = f <= 0 ? meta.esperado_hoy : f >= 1 ? meta.objetivo : (meta.esperado_hoy - meta.objetivo * f) / (1 - f);
  return (
    <figure class="graf-meta" aria-label={`Apartado ${fmtExacto(meta.avance)}; a esta altura el plan pide ${fmtExacto(meta.esperado_hoy)}; objetivo ${fmtExacto(meta.objetivo)} en ${mesLargo(meta.fecha_objetivo)}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
        <line x1={P} x2={W - P} y1={Y(meta.objetivo)} y2={Y(meta.objetivo)} stroke="var(--grid)" stroke-dasharray="3 3" />
        <path d={`M${X(meta.base_fecha)},${Y(y0)} L${X(meta.fecha_objetivo)},${Y(meta.objetivo)}`} stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4" fill="none" />
        <path d={real} stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round" />
        <circle cx={X(hoy)} cy={Y(meta.avance)} r="4" fill="var(--accent)" />
      </svg>
      <figcaption class="legend small"><span><i class="lin-real" />Apartado</span><span><i class="lin-plan" />Lo necesario</span>
        <span class="num" style="margin-left:auto">{mesCorto(meta.fecha_objetivo)}</span></figcaption>
    </figure>
  );
}

// ---------- Hoja Nueva / Editar meta ----------
const PLAZOS: Array<[string, number]> = [['6 meses', 6], ['1 año', 12], ['2 años', 24]];
function sumarMeses(iso: string, n: number) {
  const [y, mo, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + n, Math.min(d, 28)));
  return t.toISOString().slice(0, 10);
}

function HojaMeta({ m, meta, cerrar, listo }: { m: Metas; meta?: Meta; cerrar: () => void; listo: (id?: number) => void }) {
  const otras = m.metas.filter((x) => x.id !== meta?.id);
  const conPct = otras.length > 0;
  const [nombre, setNombre] = useState(meta?.nombre ?? '');
  const [monto, setMonto] = useState(meta ? String(meta.objetivo) : '');
  const [fecha, setFecha] = useState(meta?.fecha_objetivo ?? '');
  const [p, setP] = useState(meta ? Math.round(meta.pct * 100) : Math.min(50, Math.round(100 / (otras.length + 1))));
  const [sim, setSim] = useState<MetaSim | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const primero = useRef<HTMLInputElement>(null);
  const objetivo = Number(monto.replace(/\D/g, ''));
  const valido = nombre.trim().length > 0 && objetivo > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha > m.hoy && (!conPct || (p >= 1 && p <= 99));
  const input = (): MetaInput => ({ id: meta?.id ?? null, nombre: nombre.trim().slice(0, 40), objetivo, fecha_objetivo: fecha, pct: conPct ? p / 100 : 1 });

  useEffect(() => {
    primero.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  // vista previa (no guarda): espera a que deje de escribir
  useEffect(() => {
    setSim(null);
    if (!valido) return;
    const id = setTimeout(() => { api.metaSimular(input()).then(setSim).catch((e) => setError(e instanceof Error ? e.message : '')); }, 500);
    return () => clearTimeout(id);
  }, [nombre, objetivo, fecha, p]);

  const guardar = async () => {
    if (!valido || guardando) return;
    setGuardando(true); setError('');
    try { const r = await api.metaGuardar(input()); listo(r.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); setGuardando(false); }
  };
  const sm = sim?.meta;
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div class="sheet registro" role="dialog" aria-modal="true" aria-labelledby="meta-t" data-testid="hoja-meta">
      <form style="display:flex;flex-direction:column;gap:10px" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <div class="grab" />
        <div class="reg-top"><h2 id="meta-t" style="margin:0;font-size:17px">{meta ? 'Editar meta' : 'Nueva meta'}</h2>
          <button type="button" class="iconbtn" aria-label="Cerrar" onClick={cerrar}><Icon n="cerrar" size={22} /></button></div>
        <label class="campo">Nombre
          <input ref={primero} value={nombre} maxLength={40} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} placeholder="Ej.: Viaje" data-testid="meta-nombre" />
        </label>
        <div class="small">El nombre queda en tu app. Al asistente le llega como "Meta 1", "Meta 2".</div>
        <label class="campo">Cuánto necesitás
          <input inputMode="numeric" value={objetivo ? fmtExacto(objetivo, { ver: true }) : ''} onInput={(e) => setMonto((e.target as HTMLInputElement).value)}
            placeholder="$ 0" data-testid="meta-monto" />
        </label>
        <div class="campo">Para cuándo
          <div class="asis-chips">{PLAZOS.map(([t, n]) => {
            const f = sumarMeses(m.hoy, n);
            return <button type="button" class="chip-g" aria-pressed={fecha === f} onClick={() => setFecha(f)}>{t}</button>;
          })}</div>
          <input type="date" value={fecha} min={sumarDias(m.hoy, 1)} onInput={(e) => setFecha((e.target as HTMLInputElement).value)} aria-label="Fecha objetivo" data-testid="meta-fecha" />
        </div>
        {conPct ? (
          <label class="campo">Qué parte de la reserva
            <span style="display:flex;align-items:center;gap:10px">
              <input type="range" min={1} max={99} value={p} onInput={(e) => setP(Number((e.target as HTMLInputElement).value))} style="flex:1" data-testid="meta-pct" />
              <b class="num" style="width:44px;text-align:right">{p}%</b>
            </span>
            <span class="small">{(sim?.otras ?? otras.map((o) => ({ ...o, pct: o.pct * (1 - p / 100) / otras.reduce((a, b) => a + b.pct, 0) })))
              .map((o) => `${o.nombre} queda en ${pct(o.pct)}`).join(' · ')}</span>
          </label>
        ) : <div class="small">Es tu única meta: tiene el 100% de la reserva.</div>}
        {sm && (
          <div class="box" data-testid="meta-preview" aria-live="polite">
            <div class="small">Arranca con {fmtAbrev(sm.avance)} ({pct(sm.pct)} de la reserva)</div>
            {sm.aporte_reserva_mes != null && <div><b class="num">{fmtAbrev(sm.aporte_reserva_mes)}</b> por mes a la reserva para llegar</div>}
            {sm.proyeccion.llega != null && <div class={`small ${sm.proyeccion.llega ? 'good' : 'warn'}`}>
              {sm.proyeccion.llega ? 'Con tu proyección, llegás sin perforar el piso.' : `Con tu proyección no llegás: en ${mesLargo(sm.fecha_objetivo)} te quedan ${fmtAbrev(sm.proyeccion.margen_sobre_piso)} sobre el piso.`}
            </div>}
          </div>
        )}
        {error && <div class="small warn" role="alert">{error}</div>}
        <button class="btn" type="submit" disabled={!valido || guardando} data-testid="meta-guardar">{guardando ? 'Guardando…' : meta ? 'Guardar cambios' : 'Crear meta'}</button>
      </form>
      </div>
    </div>
  );
}
