// Campanita (diseño A): botón en el encabezado con contador + hoja con avisos accionables.
// Los avisos los detecta la base cada hora. El push solo invita a abrir esta hoja (#avisos).
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type Alerta, type Alertas, type EstadoAlerta } from '../api';
import { fmtAbrev, fmtDDMM, fmtExacto, nombreMes } from '../format';
import { Icon } from '../ui';
import { HojaAsistente } from './Asistente';
import { activarPush, desactivarPush, estadoPush, probarPush, type EstadoPush } from '../push';

const ver = (n: unknown) => fmtAbrev(Number(n), { ver: true });   // para el texto que va al asistente (sin máscara)
const mesAnio = (iso: string) => `${nombreMes(iso)} ${iso.slice(0, 4)}`;

let refrescarContador: () => void = () => {};
/** Otras pantallas (Metas) pueden pedir que se vuelva a leer el contador. */
export function avisosCambiaron() { refrescarContador(); }

export function BotonCampana() {
  const [n, setN] = useState(0);
  const [abierta, setAbierta] = useState(location.hash === '#avisos');
  const btn = useRef<HTMLButtonElement>(null);
  const leer = () => api.alertas().then((a) => setN(a.nuevas)).catch(() => { /* el contador no es crítico */ });
  useEffect(() => {
    refrescarContador = leer;
    leer();
    const vis = () => document.visibilityState === 'visible' && leer();
    const hash = () => { if (location.hash === '#avisos') setAbierta(true); };
    document.addEventListener('visibilitychange', vis);
    addEventListener('hashchange', hash);
    return () => { document.removeEventListener('visibilitychange', vis); removeEventListener('hashchange', hash); };
  }, []);
  const cerrar = () => {
    setAbierta(false);
    if (location.hash === '#avisos') history.replaceState(null, '', location.pathname + location.search + '#inicio');
    leer();
    btn.current?.focus();
  };
  return (
    <>
      <button ref={btn} class="iconbtn campana" aria-label={n ? `Avisos: ${n} nuevos` : 'Avisos'} data-testid="campana" onClick={() => setAbierta(true)}>
        <Icon n="campana" size={22} />
        {n > 0 && <span class="badge num" aria-hidden="true" data-testid="badge">{n > 9 ? '9+' : n}</span>}
      </button>
      {abierta && <HojaAvisos cerrar={cerrar} setContador={setN} />}
    </>
  );
}

function HojaAvisos({ cerrar, setContador }: { cerrar: () => void; setContador: (n: number) => void }) {
  const [d, setD] = useState<Alertas | null>(null);
  const [error, setError] = useState(false);
  const [preguntar, setPreguntarSt] = useState<string | null>(null);
  const preguntando = useRef(false);
  const setPreguntar = (t: string | null) => { preguntando.current = t != null; setPreguntarSt(t); };
  const [verRevisados, setVerRevisados] = useState(false);
  const [nota, setNota] = useState<Record<number, string>>({});
  const titulo = useRef<HTMLHeadingElement>(null);

  const cargar = () => api.alertas().then((a) => { setD(a); setContador(a.nuevas); setError(false); }).catch(() => setError(true));
  useEffect(() => {
    cargar();
    titulo.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !preguntando.current && cerrar();
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);

  const marcar = async (a: Alerta, estado: EstadoAlerta | 'no_reconocida', msg?: string) => {
    // optimista: se mueve ya; si falla, se vuelve a leer
    const nuevo: Partial<Alerta> = estado === 'no_reconocida' ? { estado: 'vista', no_reconocida: true }
      : { estado, ...(estado === 'validada' ? { no_reconocida: false } : {}) };
    setD((x) => x && { ...x, items: x.items.map((i) => (i.id === a.id ? { ...i, ...nuevo } : i)) });
    if (msg) setNota((x) => ({ ...x, [a.id]: msg }));
    try { const r = await api.alertaMarcar(a.id, estado); setContador(r.nuevas); setD((x) => x && { ...x, nuevas: r.nuevas }); }
    catch { cargar(); }
  };
  const todoVisto = async () => {
    const nuevas = d?.items.filter((i) => i.estado === 'nueva') ?? [];
    for (const a of nuevas) await marcar(a, 'vista');
  };
  const irAMeta = (a: Alerta) => {
    if (a.estado === 'nueva') marcar(a, 'vista');
    cerrar();
    location.hash = a.detalle?.meta_id ? `metas/${a.detalle.meta_id}` : 'metas';
  };

  if (preguntar != null) return <HojaAsistente inicial={preguntar} cerrar={() => setPreguntar(null)} />;

  const abiertos = d?.items.filter((i) => i.estado === 'nueva' || i.estado === 'vista') ?? [];
  const revisados = d?.items.filter((i) => i.estado === 'validada' || i.estado === 'descartada') ?? [];
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <section class="sheet avisos" role="dialog" aria-modal="true" aria-labelledby="avisos-t" data-testid="hoja-avisos">
        <div class="grab" />
        <header class="asis-head">
          <h2 id="avisos-t" tabIndex={-1} ref={titulo}>Avisos</h2>
          {(d?.nuevas ?? 0) > 0 && <button class="linkbtn" onClick={todoVisto} data-testid="todo-visto">Marcar todo visto</button>}
          <button class="iconbtn" aria-label="Cerrar" onClick={cerrar}><Icon n="cerrar" size={22} /></button>
        </header>
        <div class="avisos-lista">
          {error && <div class="small" role="alert">No pudimos cargar los avisos. <button class="linkbtn" onClick={cargar}>Reintentar</button></div>}
          {!d && !error && <div class="skel" style="height:120px" aria-hidden="true" />}
          {d && abiertos.length === 0 && <div class="small" data-testid="sin-avisos">No tenés avisos para revisar.</div>}
          {abiertos.map((a) => (
            <TarjetaAviso a={a} nota={nota[a.id]} marcar={marcar} preguntar={setPreguntar} irAMeta={irAMeta} />
          ))}
          {revisados.length > 0 && (
            <div class="avisos-rev">
              <button class="linkbtn" aria-expanded={verRevisados} onClick={() => setVerRevisados(!verRevisados)} data-testid="ver-revisados">
                {verRevisados ? 'Ocultar revisados' : `Ya revisados (${revisados.length})`}
              </button>
              {verRevisados && (
                <ul class="rows">
                  {revisados.map((a) => (
                    <li class="fila1">
                      <span class="ell">{a.titulo}</span>
                      <span class="small">{a.estado === 'validada' ? 'Está bien' : 'Descartado'}</span>
                      <button class="linkbtn" onClick={() => marcar(a, 'vista')} aria-label={`Volver a revisar: ${a.titulo}`}>Volver</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <AjustePush />
        </div>
      </section>
    </div>
  );
}

function TarjetaAviso({ a, nota, marcar, preguntar, irAMeta }: {
  a: Alerta; nota?: string; marcar: (a: Alerta, e: EstadoAlerta | 'no_reconocida', msg?: string) => void;
  preguntar: (t: string) => void; irAMeta: (a: Alerta) => void;
}) {
  const x = a.detalle ?? {};
  let detalle = '';
  let botones: preact.ComponentChildren = null;
  const ok = (txt = 'Está bien') => <button class="chip-g" onClick={() => marcar(a, 'validada')} data-testid="validar">{txt}</button>;
  const desc = <button class="chip-g" onClick={() => marcar(a, 'descartada')} data-testid="descartar">Descartar</button>;
  const preg = (t: string) => <button class="chip-g" onClick={() => { if (a.estado === 'nueva') marcar(a, 'vista'); preguntar(t); }} data-testid="preguntar"><Icon n="chispa" size={16} />Preguntar</button>;
  const c = a.cargo;
  const enTarjeta = c?.tarjeta ? ` · ${c.tarjeta}` : '';
  // "No la reconozco": muestra el cargo completo (sale de la base, sin IA) y habilita mandarle el comercio al asistente
  const noReconozco = <button class="chip-g" onClick={() => marcar(a, 'no_reconocida')} data-testid="no-reconozco">
    {a.tipo === 'duplicado' ? 'Es un error' : 'No la reconozco'}</button>;
  const pregCargo = c ? preg(`No reconozco el cargo de ${ver(c.monto)} del ${fmtDDMM(c.fecha)} en la ${c.tarjeta ?? 'tarjeta'}. ¿Qué puede ser y cómo lo desconozco?`) : null;

  switch (a.tipo) {
    case 'aumento':
      detalle = `${fmtAbrev(x.monto_anterior)} → ${fmtAbrev(x.monto)} · ${fmtDDMM(a.fecha)} · más que la inflación + 3 pts`;
      botones = <>{ok()}{preg(`Un gasto de ${a.rubro ?? 'servicios'} subió ${x.variacion_pct}% este mes (de ${ver(x.monto_anterior)} a ${ver(x.monto)}). ¿Cómo me afecta y qué me conviene hacer?`)}{desc}</>;
      break;
    case 'suscripcion_nueva':
      detalle = `${fmtAbrev(x.monto)} por mes · primer cargo ${x.primera_vez ? fmtDDMM(x.primera_vez) : fmtDDMM(a.fecha)}${enTarjeta}`;
      botones = a.no_reconocida ? <>{pregCargo}{ok('Ya lo resolví')}</> : <>{ok('Es mía')}{noReconozco}</>;
      break;
    case 'duplicado':
      detalle = `${fmtAbrev(x.monto)} dos veces · ${(x.fechas ?? []).map((f: string) => fmtDDMM(f)).join(' y ')}${enTarjeta}`;
      botones = a.no_reconocida ? <>{pregCargo}{ok('Ya lo resolví')}</> : <>{ok('Es correcto')}{noReconozco}</>;
      break;
    case 'meta_desvio':
      detalle = `Llevás ${fmtAbrev(x.avance)} y a esta altura tendrías que tener ${fmtAbrev(x.esperado_hoy)}` +
        (x.aporte_reserva_mes ? `. Para llegar, sumá ${fmtAbrev(x.aporte_reserva_mes)} por mes a la reserva.` : '.');
      botones = <><button class="chip-g" onClick={() => irAMeta(a)} data-testid="ver-meta">Ver meta</button>
        {preg(`Mi meta de ${ver(x.objetivo)} para ${mesAnio(x.fecha_objetivo)} va atrasada. ¿Cómo la recupero?`)}{ok('Visto')}</>;
      break;
    case 'meta_en_riesgo':
      detalle = `Para ${mesAnio(x.fecha_objetivo)} la proyección te deja ${fmtAbrev(x.margen_sobre_piso)} sobre el piso y tus metas necesitan ${fmtAbrev(x.necesitas_apartado)}.`;
      botones = <><button class="chip-g" onClick={() => irAMeta(a)} data-testid="ver-meta">Ver meta</button>
        {preg(`Según la proyección no llego a mi meta de ${ver(x.objetivo)} para ${mesAnio(x.fecha_objetivo)}. ¿Qué puedo ajustar?`)}{ok('Visto')}</>;
      break;
    case 'metas_valle':
      detalle = `El ${fmtDDMM(x.fecha_valle)} tu liquidez baja a ${fmtAbrev(x.minimo)} y en metas tenés ${fmtAbrev(x.asignado_en_pesos)} en pesos.`;
      botones = <><button class="chip-g" onClick={() => irAMeta(a)}>Ver metas</button>
        {preg('La proyección dice que un valle me obligaría a usar plata de mis metas. ¿Cómo lo evito?')}{ok('Visto')}</>;
      break;
  }
  return (
    <article class={`aviso-card ${a.estado === 'nueva' ? 'nueva' : ''}`} data-testid="aviso-card" aria-label={`${a.estado === 'nueva' ? 'Nuevo: ' : ''}${a.titulo}`}>
      <div class="aviso-tit">{a.estado === 'nueva' && <span class="punto-nuevo" aria-hidden="true" />}<b>{a.titulo}</b></div>
      <div class="small num">{detalle}</div>
      {nota && <div class="small warn" role="status">{nota}</div>}
      {a.no_reconocida && c && <DetalleCargo c={c} />}
      <div class="asis-chips">{botones}</div>
    </article>
  );
}

/** Cargo no reconocido: todo lo que hace falta para reclamarlo, y los pasos. */
function DetalleCargo({ c }: { c: NonNullable<Alerta['cargo']> }) {
  return (
    <div class="box cargo" data-testid="detalle-cargo">
      <dl class="num">
        <dt>Tarjeta</dt><dd>{c.tarjeta ?? '—'}</dd>
        <dt>Fecha</dt><dd>{fmtDDMM(c.fecha)}</dd>
        <dt>Monto</dt><dd>{fmtExacto(c.monto)}</dd>
        <dt>En el resumen figura</dt><dd>{c.descripcion}</dd>
        {c.cupon && <><dt>Cupón</dt><dd>{c.cupon}</dd></>}
        {c.resumen_vencimiento && <><dt>Resumen</dt><dd>cierre {c.resumen_cierre ? fmtDDMM(c.resumen_cierre) : '—'} · vence {fmtDDMM(c.resumen_vencimiento)}</dd></>}
      </dl>
      <ol class="pasos small">
        {c.tarjeta && /\(de /i.test(c.tarjeta) && <li>La tarjeta es de otra persona: preguntale primero si es suyo.</li>}
        <li>Si nadie lo reconoce, llamá al banco de la tarjeta y desconocé el cargo con la fecha, el monto y el cupón.</li>
        <li>Hacelo pronto: hay un plazo para impugnar el resumen y corre desde que te llegó. El banco te confirma cuál es.</li>
        <li>Si es una suscripción, pedí también la baja para que no se repita.</li>
      </ol>
    </div>
  );
}

/** Notificaciones: solo invitan a abrir la app, como máximo una por día y solo por avisos importantes. */
function AjustePush() {
  const [estado, setEstado] = useState<EstadoPush | 'cargando'>('cargando');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const refrescar = () => estadoPush().then(setEstado).catch(() => setEstado('sin-configurar'));
  useEffect(() => { refrescar(); }, []);
  const hacer = async (f: () => Promise<void>, ok: string) => {
    setOcupado(true); setMsg('');
    try { await f(); setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo'); }
    setOcupado(false); refrescar();
  };
  if (estado === 'cargando') return null;
  return (
    <div class="push-ajuste" data-testid="push">
      <div style="display:flex;align-items:center;gap:10px">
        <Icon n="campana" size={20} />
        <div style="flex:1">
          <div style="font-weight:600">Notificaciones</div>
          <div class="small">{estado === 'activo' ? 'Activadas · sin montos, máximo una por día'
            : estado === 'bloqueado' ? 'Bloqueadas en los ajustes del teléfono'
            : estado === 'no-soportado' ? 'Instalá la app en el inicio para usarlas'
            : estado === 'sin-configurar' ? 'Todavía no están configuradas' : 'Desactivadas'}</div>
        </div>
        {estado === 'inactivo' && <button class="btn" disabled={ocupado} onClick={() => hacer(activarPush, 'Listo, te aviso cuando haya algo importante')} data-testid="push-activar">Activar</button>}
      </div>
      {estado === 'activo' && (
        <div style="display:flex;gap:8px">
          <button class="chip-g" disabled={ocupado} onClick={() => hacer(probarPush, 'Te mandé una de prueba')}>Probar</button>
          <button class="chip-g" disabled={ocupado} onClick={() => hacer(desactivarPush, 'Notificaciones desactivadas')}>Desactivar</button>
        </div>
      )}
      {msg && <div class="small" role="status">{msg}</div>}
    </div>
  );
}

