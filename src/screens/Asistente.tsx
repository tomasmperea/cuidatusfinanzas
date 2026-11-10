// Asistente "¿Me lo puedo permitir?" — botón flotante en Inicio + hoja de chat (diseño A).
// Los números de la tarjeta salen de la simulación de la base (no del texto de la IA).
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type ConvResumen, type MsgGuardado, type RespuestaIA, type SimTarjeta } from '../api';
import { estaOculto, fmtAbrev, fmtDDMM, fmtDia, fmtExacto, nombreMes, taparEnTexto } from '../format';
import { Icon } from '../ui';

type Msg =
  | { de: 'yo'; texto: string }
  | { de: 'ia'; id: number | null; r: RespuestaIA; guardado?: boolean; recordado?: boolean };

// La conversación dura mientras la app está abierta (cerrar la hoja no la borra).
let conv = { id: nuevoId(), msgs: [] as Msg[], uso: null as null | { consultas_hoy: number; tope_diario: number } };
function nuevoId(): string { return crypto.randomUUID(); }

export function BotonAsistente() {
  const [abierto, setAbierto] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} class="fab" aria-label="Asistente: ¿me lo puedo permitir?" data-testid="fab-asistente" onClick={() => setAbierto(true)}>
        <Icon n="chispa" size={28} />
      </button>
      {abierto && <HojaAsistente cerrar={() => { setAbierto(false); btn.current?.focus(); }} />}
    </>
  );
}

const SUGERENCIAS = ['Cambiar la moto en cuotas', 'Un viaje', 'Invertir parte del aguinaldo'];

/** inicial: texto precargado (desde un aviso o una meta). Arranca una conversación nueva para ese tema. */
export function HojaAsistente({ cerrar, inicial }: { cerrar: () => void; inicial?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (inicial && conv.msgs.length) conv = { id: nuevoId(), msgs: [], uso: conv.uso };   // solo al abrir
    return conv.msgs;
  });
  const [texto, setTexto] = useState(inicial ?? '');
  const [pensando, setPensando] = useState(false);
  const [uso, setUso] = useState(conv.uso);
  const lista = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { conv.msgs = msgs; conv.uso = uso; }, [msgs, uso]);
  useEffect(() => { lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, pensando]);
  useEffect(() => {
    input.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);

  const enviar = async (t: string) => {
    const m = t.trim();
    if (!m || pensando) return;
    setTexto('');
    setMsgs((x) => [...x, { de: 'yo', texto: m }]);
    setPensando(true);
    try {
      const r = await api.asistente(conv.id, m);
      setMsgs((x) => [...x, { de: 'ia', id: r.id, r: r.respuesta }]);
      if (r.uso) setUso({ consultas_hoy: r.uso.consultas_hoy, tope_diario: r.uso.tope_diario });
    } catch (e) {
      setMsgs((x) => [...x, { de: 'ia', id: null, r: { tipo: 'error', texto: e instanceof Error ? e.message : 'No pude responder.' } }]);
    } finally {
      setPensando(false);
    }
  };
  const nueva = () => { conv = { id: nuevoId(), msgs: [], uso }; setMsgs([]); setVista('chat'); setTimeout(() => input.current?.focus()); };
  const [vista, setVista] = useState<'chat' | 'historial'>('chat');
  const [cargando, setCargando] = useState(false);
  const retomar = async (id: string) => {
    if (id === conv.id) { setVista('chat'); return; }
    setCargando(true);
    try {
      const ms = await api.iaConversacion(id);
      const nuevos: Msg[] = ms.map((m: MsgGuardado) => m.rol === 'usuario'
        ? { de: 'yo' as const, texto: String(m.contenido?.texto ?? '') }
        : { de: 'ia' as const, id: m.id, r: m.contenido as RespuestaIA, guardado: m.guardado });
      conv = { id, msgs: nuevos, uso };
      setMsgs(nuevos);
      setVista('chat');
      setTimeout(() => input.current?.focus());
    } catch { /* queda en la lista; se puede reintentar */ } finally { setCargando(false); }
  };
  const marcar = async (i: number, accion: 'guardar' | 'recordar') => {
    const m = msgs[i];
    if (m.de !== 'ia') return;
    try {
      await api.iaMarcar(accion, m.id, accion === 'recordar' ? m.r.recordar ?? null : null);
      setMsgs((x) => x.map((y, j) => (j === i && y.de === 'ia' ? { ...y, [accion === 'guardar' ? 'guardado' : 'recordado']: true } : y)));
    } catch { /* el botón queda disponible para reintentar */ }
  };

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <section class="sheet asis" role="dialog" aria-modal="true" aria-labelledby="asis-t" data-testid="hoja-asistente">
        <div class="grab" />
        <header class="asis-head">
          <h2 id="asis-t">{vista === 'historial' ? 'Conversaciones' : '¿Me lo puedo permitir?'}</h2>
          {vista === 'chat' && msgs.length > 0 && <button class="iconbtn" aria-label="Nueva conversación" onClick={nueva} data-testid="nueva"><Icon n="plus" size={22} /></button>}
          <button class="iconbtn" aria-label={vista === 'historial' ? 'Volver al chat' : 'Conversaciones anteriores'} aria-pressed={vista === 'historial'}
            onClick={() => setVista(vista === 'historial' ? 'chat' : 'historial')} data-testid="btn-historial">
            <Icon n={vista === 'historial' ? 'atras' : 'historial'} size={22} />
          </button>
          <button class="iconbtn" aria-label="Cerrar" onClick={cerrar}><Icon n="cerrar" size={22} /></button>
        </header>

        {vista === 'historial' && <Historial actual={conv.id} elegir={retomar} cargando={cargando} limite={30} />}
        <div class="asis-lista" ref={lista} aria-live="polite" hidden={vista !== 'chat'}>
          {msgs.length === 0 && (
            <div class="asis-vacio">
              <p class="small" style="margin:0">Contame qué querés comprar, financiar o invertir y lo proyecto con tus datos.</p>
              <div class="asis-chips">{SUGERENCIAS.map((s) => <button class="chip-g" onClick={() => setTexto(s + ': ')}>{s}</button>)}</div>
              <Historial actual={conv.id} elegir={retomar} cargando={cargando} limite={3} verTodas={() => setVista('historial')} />
            </div>
          )}
          {msgs.map((m, i) => m.de === 'yo'
            ? <div class="burb yo">{taparEnTexto(m.texto)}</div>
            : <MsgIA m={m} ultimo={i === msgs.length - 1} enviar={enviar} marcar={(a) => marcar(i, a)} ocupado={pensando} />)}
          {pensando && <div class="burb ia pensando" role="status"><span class="dots" aria-hidden="true"><i /><i /><i /></span><span class="sr">Pensando…</span></div>}
          <div class="asis-nota small"><Icon n="candado" size={16} /><span style="flex:1">Solo lee tus datos. No registra ni modifica nada.</span>
            {uso && <span class="num" data-testid="uso">{uso.consultas_hoy}/{uso.tope_diario} hoy</span>}</div>
        </div>

        <form class="asis-form" hidden={vista !== 'chat'} onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <label for="asis-in" class="sr">Tu consulta</label>
          <input id="asis-in" ref={input} value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
            placeholder={msgs.length ? 'Preguntá algo más…' : 'Escribí tu consulta…'} maxLength={1000} autocomplete="off" data-testid="asis-input" />
          <button class="asis-enviar" aria-label="Enviar" disabled={pensando || !texto.trim()} data-testid="asis-enviar"><Icon n="enviar" size={22} /></button>
        </form>
      </section>
    </div>
  );
}

function MsgIA({ m, ultimo, enviar, marcar, ocupado }: {
  m: Extract<Msg, { de: 'ia' }>; ultimo: boolean; enviar: (t: string) => void; marcar: (a: 'guardar' | 'recordar') => void; ocupado: boolean;
}) {
  const r = m.r;
  if (r.tipo === 'pregunta') return <Preguntas r={r} activo={ultimo && !ocupado} enviar={enviar} />;
  if (r.tipo === 'veredicto' && r.simulaciones?.central) {
    return (
      <>
        <Veredicto r={r} s={r.simulaciones.central} />
        {ultimo && (
          <div class="asis-chips" data-testid="chips">
            {(r.chips ?? []).map((c) => <button class="chip-g" disabled={ocupado} onClick={() => enviar(c)}>{c}</button>)}
            <button class="chip-g" aria-pressed={!!m.guardado} disabled={m.guardado || m.id == null} onClick={() => marcar('guardar')} data-testid="guardar">
              {m.guardado ? 'Escenario guardado' : 'Guardar escenario'}
            </button>
            {r.recordar && (
              <button class="chip-g" aria-pressed={!!m.recordado} disabled={m.recordado} onClick={() => marcar('recordar')} data-testid="recordar">
                {m.recordado ? 'Lo voy a tener en cuenta' : `Recordar: ${r.recordar}`}
              </button>
            )}
          </div>
        )}
      </>
    );
  }
  return <div class={`burb ia ${r.tipo === 'error' ? 'err' : ''}`} role={r.tipo === 'error' ? 'alert' : undefined}>{taparEnTexto(r.texto)}</div>;
}

function Preguntas({ r, activo, enviar }: { r: RespuestaIA; activo: boolean; enviar: (t: string) => void }) {
  const qs = r.preguntas ?? [];
  const [sel, setSel] = useState<Record<number, string>>({});
  const elegir = (i: number, o: string) => {
    const nuevo = { ...sel, [i]: o };
    setSel(nuevo);
    if (qs.every((_, j) => nuevo[j])) enviar(qs.map((q, j) => (qs.length > 1 ? `${q.texto} ${nuevo[j]}` : nuevo[j])).join('. '));
  };
  return (
    <>
      {r.texto && <div class="burb ia">{taparEnTexto(r.texto)}</div>}
      {qs.map((q, i) => (
        <div class="burb ia preg" role="group" aria-label={q.texto}>
          <span>{taparEnTexto(q.texto)}</span>
          <div class="asis-chips">
            {q.opciones.map((o) => (
              <button class="chip-g" aria-pressed={sel[i] === o} disabled={!activo} onClick={() => elegir(i, o)}>{taparEnTexto(o)}</button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

const VEREDICTO: Record<string, { txt: string; cls: string }> = {
  te_da: { txt: 'Te da', cls: 'v-ok' }, ajustado: { txt: 'Ajustado', cls: 'v-aj' }, no_te_da: { txt: 'No te da', cls: 'v-no' },
};
const mesCorto = (ym: string) => `${nombreMes(ym + '-01').slice(0, 3)} ${ym.slice(2, 4)}`;

function Veredicto({ r, s }: { r: RespuestaIA; s: SimTarjeta }) {
  const v = VEREDICTO[r.veredicto ?? 'ajustado'];
  const sup = s.supuestos ?? {};
  const cons = r.simulaciones?.conservador;
  const opt = r.simulaciones?.optimista;
  // Efecto de la decisión: se mide desde la fecha de la compra y contra el mismo escenario sin ella.
  const inc = s.minimo_con_desde_compra != null;
  const desde = inc ? s.desde_fecha_compra ?? null : null;
  const minCon = inc ? s.minimo_con_desde_compra! : s.minimo_con;
  const minSin = inc ? s.minimo_sin_desde_compra ?? s.minimo_sin : s.minimo_sin;
  const mesMin = (inc ? s.mes_minimo_con_desde_compra : null) ?? s.mes_minimo_con;
  const diasExtra = inc ? Math.max(s.dias_bajo_piso - (s.dias_bajo_piso_sin ?? 0), 0) : null;
  const quiebrePorCompra = s.quiebre && (!inc || !s.quiebre_sin || s.quiebre < s.quiebre_sin) ? s.quiebre : null;
  const pctCuota = inc ? s.egreso_recurrente_sobre_sueldo_pct : s.primer_egreso_sobre_sueldo_pct;
  const vallePrevio = inc && s.minimo_sin < s.piso && (!desde || s.mes_minimo_sin < desde.slice(0, 7));
  const pesim = cons ? (cons.minimo_con_desde_compra ?? cons.minimo_con) : null;
  const optim = opt ? (opt.minimo_con_desde_compra ?? opt.minimo_con) : null;
  const lblMin = desde ? `Mínimo desde el ${fmtDDMM(desde)}` : 'Liquidez mínima';
  const aria = `${v.txt}. ${r.titulo ?? ''}. Proyección a ${s.meses} meses. ${lblMin}: ${fmtExacto(minCon)} en ${mesCorto(mesMin)}; sin la compra ${fmtExacto(minSin)}. ` +
    (diasExtra != null ? `${diasExtra} días extra bajo el piso por la compra. ` : `${s.dias_bajo_piso} días bajo el piso. `) +
    `${estaOculto() ? '' : r.texto}`;
  return (
    <article class="asis-card" data-testid="veredicto" aria-label={aria}>
      <div class="asis-card-top" aria-hidden="true">
        <span class={`v-tag ${v.cls}`}>{v.txt}</span>
        <span class="small">Proyección a {s.meses} meses</span>
      </div>
      {r.titulo && <div class="asis-tit" aria-hidden="true">{r.titulo}</div>}
      <div class="asis-txt" aria-hidden="true">{taparEnTexto(r.texto)}</div>
      <Grafico s={s} />
      <dl class="asis-datos num" aria-hidden="true">
        <dt>{lblMin}</dt><dd>{fmtAbrev(minCon)} · {mesCorto(mesMin)}</dd>
        <dt>Sin la compra</dt><dd>{fmtAbrev(minSin)}</dd>
        {diasExtra != null
          ? <><dt>Días extra bajo el piso</dt><dd>{diasExtra > 0 ? `+${diasExtra}` : 'Ninguno'}</dd></>
          : <><dt>Días bajo el piso</dt><dd>{s.dias_bajo_piso}</dd></>}
        {quiebrePorCompra && <><dt>Saldo negativo desde</dt><dd>{fmtDia(quiebrePorCompra)}</dd></>}
        {pctCuota != null && <><dt>Cuota sobre sueldo</dt><dd>{String(pctCuota).replace('.', ',')}%</dd></>}
        {pesim != null && <><dt>Peor escenario</dt><dd>{fmtAbrev(pesim)}</dd></>}
        {optim != null && <><dt>Mejor escenario</dt><dd>{fmtAbrev(optim)}</dd></>}
      </dl>
      {vallePrevio && <p class="small" style="margin:0" data-testid="valle-previo" aria-hidden="true">
        Aparte, sin la compra ya bajás a {fmtAbrev(s.minimo_sin)} en {mesCorto(s.mes_minimo_sin)}: eso no lo causa esta decisión.</p>}
      <details class="asis-sup">
        <summary>Supuestos usados</summary>
        <ul>
          {sup.sueldo_regla && <li>Sueldo: {sup.sueldo_regla}</li>}
          {sup.inflacion_mensual != null && <li>Inflación: {(sup.inflacion_mensual * 100).toFixed(2).replace('.', ',')}% mensual ({sup.inflacion_fuente?.split(':')[0] ?? 'REM'})</li>}
          {sup.alquiler_regla && <li>Alquiler: {sup.alquiler_regla}</li>}
          <li>Tarjetas: promedio de los últimos 3 meses, ajustado por inflación</li>
          <li>Cuotas de la compra fijas en pesos</li>
        </ul>
      </details>
    </article>
  );
}

function Grafico({ s }: { s: SimTarjeta }) {
  const W = 320, H = 110, PB = 18;
  const pts = s.serie;
  if (pts.length < 2) return null;
  const vals = pts.flatMap((p) => [p.min_con, p.min_sin]).concat(s.piso);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - PB - 12);
  const linea = (k: 'min_con' | 'min_sin') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');
  const iMesMin = s.mes_minimo_con_desde_compra ? pts.findIndex((p) => p.mes === s.mes_minimo_con_desde_compra) : -1;
  const iMin = iMesMin >= 0 ? iMesMin : pts.reduce((b, p, i) => (p.min_con < pts[b].min_con ? i : b), 0);
  const iCompra = s.desde_fecha_compra ? pts.findIndex((p) => p.mes === s.desde_fecha_compra!.slice(0, 7)) : -1;
  return (
    <svg class="asis-graf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Liquidez mínima mes a mes, con y sin la compra, frente al piso">
      <line x1="0" x2={W} y1={y(s.piso)} y2={y(s.piso)} class="g-piso" />
      {lo < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} class="g-cero" />}
      {iCompra > 0 && <line x1={x(iCompra)} x2={x(iCompra)} y1="4" y2={H - PB} class="g-compra" />}
      <path d={linea('min_sin')} class="g-sin" />
      <path d={linea('min_con')} class="g-con" />
      <circle cx={x(iMin)} cy={y(pts[iMin].min_con)} r="4" class="g-min" />
      <text x="0" y={H - 3} class="g-lbl">{mesCorto(pts[0].mes)}</text>
      <text x={W} y={H - 3} class="g-lbl" text-anchor="end">{mesCorto(pts[pts.length - 1].mes)}</text>
    </svg>
  );
}

function Historial({ actual, elegir, cargando, limite, verTodas }: {
  actual: string; elegir: (id: string) => void; cargando: boolean; limite: number; verTodas?: () => void;
}) {
  const [lista, setLista] = useState<ConvResumen[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.iaConversaciones().then(setLista, () => setError(true)); }, []);
  const items = (lista ?? []).filter((c) => c.id !== actual).slice(0, limite);
  if (verTodas && (!lista || items.length === 0)) return null; // en el estado vacío solo aparece si hay algo para retomar
  return (
    <section class={verTodas ? 'asis-hist compacto' : 'asis-hist'} aria-label="Conversaciones anteriores" data-testid="historial">
      {verTodas && <h3 class="small" style="margin:8px 0 0;font-weight:650">Retomar una conversación</h3>}
      {error && <p class="small">No pude cargar las conversaciones.</p>}
      {!lista && !error && <p class="small">Cargando…</p>}
      {lista && items.length === 0 && <p class="small">Todavía no hay conversaciones anteriores.</p>}
      <ul class="rows">
        {items.map((c) => {
          const v = c.veredicto ? VEREDICTO[c.veredicto] : null;
          return (
            <li>
              <button class="asis-conv" disabled={cargando} onClick={() => elegir(c.id)} data-testid="conv">
                <span class="ell" style="flex:1;min-width:0;text-align:left">
                  <span class="dos-lineas" style="display:block">{taparEnTexto(c.titulo || c.pregunta || 'Conversación')}</span>
                  <span class="small">{fmtDia(new Date(c.ultimo).toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }))}{c.guardado ? ' · guardada' : ''}</span>
                </span>
                {v && <span class={`v-tag ${v.cls}`}>{v.txt}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {verTodas && lista && lista.filter((c) => c.id !== actual).length > limite &&
        <button class="linkbtn" onClick={verTodas} data-testid="ver-todas">Ver todas</button>}
    </section>
  );
}
