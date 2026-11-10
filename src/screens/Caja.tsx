import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api, type Caja as CajaData, type CuentaCaja, type Flujo, type MovCaja, type MovInput, type Pendiente, type Subcat } from '../api';
import { aTexto, evaluar, mostrar, teclear, tieneOperacion, type Tecla } from '../calc';
import { fmtAbrev, fmtDDMM, fmtDia, fmtExacto, fmtUSD, sumarDias } from '../format';
import { Icon, Load, Tri, useAsync } from '../ui';

const ICONO_GRUPO: Record<string, string> = {
  Supermercado: 'cart', Transporte: 'bus', Ocio: 'copa', Vestimenta: 'remera', Viajes: 'avion', 'Salud y belleza': 'salud',
  Automóvil: 'auto', Regalos: 'regalo', Tarjetas: 'card', Transferencia: 'flechas', Ingresos: 'ingreso', Domiciliarios: 'casa',
  Deporte: 'pesas',
};
const iconoDe = (grupo: string, subcat?: number | null) => (subcat === 1 ? 'flechas' : ICONO_GRUPO[grupo] || 'punto');

function fmtMon(n: number, moneda: string, ver = false) {
  return moneda === 'USD' ? fmtUSD(n, { ver }) : fmtExacto(n, { ver });
}

type Hoja =
  | { modo: 'nuevo'; tipo: Flujo; subcat?: number | null; destino?: number | null }
  | { modo: 'editar'; mov: MovCaja }
  | { modo: 'confirmar'; p: Pendiente };
type Aviso = { texto: string; deshacer?: () => Promise<unknown> } | null;

export function Caja({ onCambio, accionInicial }: { onCambio?: () => void; accionInicial?: Flujo | null }) {
  const [cuenta, setCuenta] = useState(100);
  const [n, setN] = useState(0);
  const caja = useAsync(() => api.caja(cuenta), [cuenta, n]);
  const [hoja, setHojaRaw] = useState<Hoja | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const setHoja = (h: Hoja | null) => { if (h) setAviso(null); setHojaRaw(h); };
  const recargar = () => { setN((x) => x + 1); onCambio?.(); };
  // Entrada por acceso directo: abre la hoja apenas están los datos (una sola vez)
  const [accionPend, setAccionPend] = useState<Flujo | null>(accionInicial ?? null);
  useEffect(() => {
    if (accionPend && caja.data) { setHoja({ modo: "nuevo", tipo: accionPend, subcat: null }); setAccionPend(null); }
  }, [accionPend, caja.data]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const accion = async (f: () => Promise<unknown>, ok: Aviso) => {
    try { await f(); setAviso(ok); } catch (e) { setAviso({ texto: e instanceof Error ? e.message : 'No se pudo' }); }
    recargar();
  };

  return (
    <>
      <Load a={caja} que="la caja" h={420}>
        {(d) => (
          <>
            <TarjetaLiquidez d={d} cuenta={cuenta} setCuenta={setCuenta} />
            <Atajos d={d} abrir={(h) => setHoja(h)} />
            {d.pendientes.length > 0 && (
              <section class="card pend" aria-label="Pagos a confirmar" data-testid="pendientes">
                {d.pendientes.map((p) => (
                  <div class="fila-pend">
                    <Icon n="mail" size={20} color="var(--warn)" />
                    <div class="ell">
                      <div class="ell">{p.descripcion || 'Pago'}</div>
                      <div class="small nw"><b class="num" style="color:var(--fg)">{fmtExacto(p.monto * p.signo)}</b> · {fmtDDMM(p.fecha)}{p.ts ? ' ' + p.ts.slice(11, 16) : ''}</div>
                    </div>
                    <button class="btn conf-btn" onClick={() => setHoja({ modo: 'confirmar', p })}>Confirmar</button>
                    <button class="act" aria-label="Descartar" onClick={() => accion(() => api.descartarPendiente(p.id),
                      { texto: 'Descartado', deshacer: () => api.descartarPendiente(p.id, true) })}><Icon n="tacho" size={18} /></button>
                  </div>
                ))}
              </section>
            )}
            <Movimientos movs={d.movimientos} hoy={d.hoy}
              editar={(m) => setHoja({ modo: 'editar', mov: m })}
              borrar={(m) => accion(() => api.borrarMov(m.id), { texto: 'Borrado', deshacer: () => api.borrarMov(m.id, true) })} />
            <button class="fab" aria-label="Registrar movimiento" data-testid="fab" onClick={() => setHoja({ modo: 'nuevo', tipo: 'gasto', subcat: null })}>
              <Icon n="plus" size={28} />
            </button>
            {hoja && <HojaRegistro d={d} hoja={hoja} cuentaActual={cuenta} cerrar={() => setHoja(null)}
              listo={(r, deshacer) => { setHoja(null); setAviso({ texto: 'Guardado', deshacer }); recargar(); void r; }} />}
          </>
        )}
      </Load>
      {aviso && (
        <div class="toast" role="status" data-testid="toast">
          <span>{aviso.texto}</span>
          {aviso.deshacer && <button onClick={() => { const f = aviso.deshacer!; setAviso(null); accion(f, { texto: 'Deshecho' }); }}>Deshacer</button>}
        </div>
      )}
    </>
  );
}

function TarjetaLiquidez({ d, cuenta, setCuenta }: { d: CajaData; cuenta: number; setCuenta: (c: number) => void }) {
  const v = d.liquidez.var_mes;
  return (
    <section class="hero-card" aria-label="Liquidez" data-testid="liquidez-caja">
      <svg class="blob" width="150" height="150" viewBox="0 0 150 150" aria-hidden="true"><path d="M75 5c18 0 22 18 38 26s34 6 34 30-18 24-22 40-6 44-32 44-26-20-42-28S3 112 3 88s16-26 20-42S47 5 75 5z" fill="#FFFFFF" /></svg>
      <div class="eyebrow">Liquidez</div>
      <div class="hero-num num" data-testid="liquidez-valor">{fmtExacto(Math.round(d.liquidez.saldo))}</div>
      <div class="chips"><span class="num"><Tri up={v >= 0} color="currentColor" />{fmtAbrev(v, { signoMas: true })} este mes</span></div>
      <div class="cuentas" role="group" aria-label="Cuenta">
        {d.cuentas.map((c: CuentaCaja) => (
          <button aria-pressed={cuenta === c.id} onClick={() => setCuenta(c.id)} data-cuenta={c.id}>
            <span class="small">{c.nombre}</span>
            <b class="num">{c.moneda === 'USD' ? fmtUSD(c.saldo ?? 0) : fmtAbrev(c.saldo ?? 0)}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function Atajos({ d, abrir }: { d: CajaData; abrir: (h: Hoja) => void }) {
  return (
    <div class="atajos" role="group" aria-label="Registrar rápido">
      {d.atajos.map((a) => (
        <button onClick={() => abrir({ modo: 'nuevo', tipo: 'gasto', subcat: a.id })} data-atajo={a.id}>
          <span><Icon n={iconoDe(a.grupo, a.id)} size={22} /></span>{a.nombre}
        </button>
      ))}
      <button onClick={() => abrir({ modo: 'nuevo', tipo: 'transferencia' })} data-atajo="transferir">
        <span><Icon n="flechas" size={22} /></span>Transferir
      </button>
    </div>
  );
}

function etiquetaDia(f: string, hoy: string) {
  if (f === hoy) return 'Hoy';
  if (f === sumarDias(hoy, -1)) return 'Ayer';
  return fmtDia(f);
}

function Movimientos({ movs, hoy, editar, borrar }: { movs: MovCaja[]; hoy: string; editar: (m: MovCaja) => void; borrar: (m: MovCaja) => void }) {
  const grupos = useMemo(() => {
    const g: Array<{ fecha: string; items: MovCaja[] }> = [];
    for (const m of movs) {
      if (!g.length || g[g.length - 1].fecha !== m.fecha) g.push({ fecha: m.fecha, items: [] });
      g[g.length - 1].items.push(m);
    }
    return g;
  }, [movs]);
  if (!movs.length) return <div class="pad small">Sin movimientos todavía.</div>;
  return (
    <section class="movs" aria-label="Últimos movimientos" data-testid="movimientos">
      {grupos.map((g) => (
        <>
          <h2 class="dia">{etiquetaDia(g.fecha, hoy)}</h2>
          <ul class="rows">
            {g.items.map((m) => (
              <li class="mv" data-mov={m.id}>
                <span class="ic"><Icon n={iconoDe(m.grupo, m.subcat_id)} size={20} /></span>
                <div class="ell"><div class="ell">{m.titulo}</div>{m.nota && m.nota !== m.titulo && <div class="small ell">{m.nota}</div>}</div>
                <span class={`num nw amt${m.signo > 0 ? ' good' : ''}`}>{fmtMon(m.monto * m.signo, m.moneda)}</span>
                {m.editable ? (
                  <>
                    <button class="act" aria-label={`Editar ${m.titulo}`} onClick={() => editar(m)}><Icon n="lapiz" size={18} /></button>
                    <button class="act" aria-label={`Borrar ${m.titulo}`} onClick={() => borrar(m)}><Icon n="tacho" size={18} /></button>
                  </>
                ) : <span class="act-vacio" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- hoja de registro
type Panel = null | 'categoria' | 'tipo' | 'cuenta' | 'destino' | 'fecha' | 'tarjeta';

function inicial(h: Hoja, d: CajaData, cuentaActual: number) {
  const base = { tipo: 'gasto' as Flujo, subcat: null as number | null, cuenta: cuentaActual === 2 ? 100 : cuentaActual,
    destino: null as number | null, expr: '', exprDest: '', fecha: d.hoy, nota: '', evid: null as number | null, id: undefined as number | undefined };
  if (h.modo === 'nuevo') {
    const destino = h.tipo === 'transferencia' ? (h.destino ?? (base.cuenta === 100 ? 101 : 100)) : null;
    return { ...base, tipo: h.tipo, subcat: h.subcat ?? null, destino };
  }
  if (h.modo === 'confirmar') {
    const s = h.p.sugerencia;
    return { ...base, cuenta: 100, tipo: s.tipo, subcat: s.subcat_id ?? null, destino: s.tipo === 'transferencia' ? (s.destino_id ?? 101) : null,
      expr: aTexto(h.p.monto), fecha: h.p.fecha < (d.desde ?? h.p.fecha) ? d.hoy : h.p.fecha,
      nota: s.nota ?? h.p.descripcion ?? '', evid: h.p.id };
  }
  const m = h.mov;
  const esTrf = m.subcat_id === 1 || m.contra_cuenta_id != null;
  // una transferencia se edita desde su lado de salida
  const sale = !esTrf || m.signo < 0;
  return { ...base, id: m.id, tipo: (esTrf ? 'transferencia' : m.signo > 0 ? 'ingreso' : 'gasto') as Flujo, subcat: esTrf ? 1 : m.subcat_id,
    cuenta: sale ? m.cuenta_id : (m.contra_cuenta_id ?? 100), destino: esTrf ? (sale ? m.contra_cuenta_id : m.cuenta_id) : null,
    expr: aTexto(sale ? m.monto : (m.contra_monto ?? m.monto)), exprDest: esTrf ? aTexto(sale ? (m.contra_monto ?? m.monto) : m.monto) : '',
    fecha: m.fecha, nota: m.nota && m.nota !== m.titulo ? m.nota : '' };
}

const TECLAS: Array<[Tecla, string, string?]> = [
  ['7', '7'], ['8', '8'], ['9', '9'], ['/', '÷', 'Dividir'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['*', '×', 'Multiplicar'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['-', '−', 'Restar'],
  [',', ','], ['0', '0'], ['del', '', 'Borrar'], ['+', '+', 'Sumar'],
];

function HojaRegistro({ d, hoja, cuentaActual, cerrar, listo }: {
  d: CajaData; hoja: Hoja; cuentaActual: number; cerrar: () => void;
  listo: (r: { id: number }, deshacer?: () => Promise<unknown>) => void;
}) {
  const ini = useMemo(() => inicial(hoja, d, cuentaActual), []);
  const [tipo, setTipo] = useState<Flujo>(ini.tipo);
  const [subcat, setSubcat] = useState<number | null>(ini.subcat);
  const [cuenta, setCuenta] = useState(ini.cuenta);
  const [destino, setDestino] = useState<number | null>(ini.destino);
  const [expr, setExpr] = useState(ini.expr);
  const [exprDest, setExprDest] = useState(ini.exprDest);
  const [enDestino, setEnDestino] = useState(false);
  const [fecha, setFecha] = useState(ini.fecha);
  const [nota, setNota] = useState(ini.nota);
  const [conNota, setConNota] = useState(!!ini.nota);
  const [panel, setPanel] = useState<Panel>(ini.tipo !== 'transferencia' && ini.subcat == null ? 'categoria' : null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); prev?.focus?.(); };
  }, []);

  const cta = d.cuentas.find((c) => c.id === cuenta)!;
  const dst = destino != null ? d.cuentas.find((c) => c.id === destino) : undefined;
  const dobleMoneda = tipo === 'transferencia' && dst && dst.moneda !== cta.moneda;
  const monto = evaluar(expr);
  const montoDest = dobleMoneda ? evaluar(exprDest) : monto;
  const sc = d.subcategorias.find((s) => s.id === subcat);
  const ayer = sumarDias(d.hoy, -1);
  const fechaMin = d.desde && d.desde > ayer ? d.desde : ayer;
  const pideTarjeta = tipo === 'gasto' && subcat === 56;

  // vista previa del saldo de la cuenta que se mueve
  const previa = (() => {
    if (monto == null || cta.saldo == null) return null;
    const signo = tipo === 'ingreso' ? 1 : -1;
    let s = cta.saldo + signo * monto;
    const original = hoja.modo === 'editar' ? hoja.mov : null;
    if (original && original.cuenta_id === cuenta) s -= original.signo * original.monto;
    return `${cta.nombre} → ${fmtMon(s, cta.moneda)}`;
  })();

  const tecla = (t: Tecla) => {
    setError('');
    if (enDestino) setExprDest((e) => teclear(e, t)); else setExpr((e) => teclear(e, t));
  };
  const cambiarTipo = (t: Flujo) => {
    setTipo(t);
    setPanel(null);
    if (t === 'transferencia') { setSubcat(1); if (destino == null || destino === cuenta) setDestino(cuenta === 100 ? 101 : 100); }
    else { setDestino(null); setEnDestino(false); if (!sc || sc.flujo !== t) { setSubcat(null); setPanel('categoria'); } }
  };

  const guardar = async () => {
    setError('');
    if (monto == null || monto <= 0) return setError('Cargá un monto');
    if (tipo !== 'transferencia' && subcat == null) { setPanel('categoria'); return setError('Elegí una categoría'); }
    if (pideTarjeta && !nota.trim()) { setPanel('tarjeta'); return setError('Elegí la tarjeta'); }
    if (tipo === 'transferencia' && (destino == null || destino === cuenta)) { setPanel('destino'); return setError('Elegí la cuenta destino'); }
    if (dobleMoneda && (montoDest == null || montoDest <= 0)) { setEnDestino(true); return setError(`Cargá cuánto entra en ${dst!.nombre}`); }
    const m: MovInput = {
      id: ini.id, tipo, monto, cuenta_id: cuenta, subcat_id: tipo === 'transferencia' ? 1 : subcat,
      destino_id: tipo === 'transferencia' ? destino : null, monto_destino: tipo === 'transferencia' ? montoDest : null,
      fecha, nota: nota.trim() || null, evid_id: ini.evid,
    };
    setEnviando(true);
    try {
      const r = await api.guardarMov(m);
      listo(r, hoja.modo === 'editar' ? undefined : () => api.borrarMov(r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  };

  const titulo = hoja.modo === 'editar' ? 'Editar movimiento' : hoja.modo === 'confirmar' ? 'Confirmar pago' : 'Nuevo movimiento';
  const NOM_TIPO: Record<Flujo, string> = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };
  const subcatsTipo = d.subcategorias.filter((s) => s.flujo === tipo && s.id !== 1);
  const exprVisible = enDestino ? exprDest : expr;

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div class="sheet registro" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref} data-testid="hoja-registro">
        <div class="grab" />
        <div class="reg-top">
          {tipo === 'transferencia' ? (
            <button class={`chip-g sel`} onClick={() => setPanel(panel === 'destino' ? null : 'destino')} data-testid="chip-destino">
              <Icon n="flechas" size={18} />{cta.nombre} → {dst?.nombre ?? '¿a dónde?'}
            </button>
          ) : (
            <button class={`chip-g${sc ? ' sel' : ''}`} onClick={() => setPanel(panel === 'categoria' ? null : 'categoria')} data-testid="chip-categoria">
              {sc && <Icon n={iconoDe(sc.grupo, sc.id)} size={18} />}{sc ? sc.nombre : 'Elegí categoría'}
            </button>
          )}
          {previa && <span class="small num nw" data-testid="previa">{previa}</span>}
        </div>

        <button class={`monto-reg${enDestino ? '' : ' activo'}`} onClick={() => setEnDestino(false)} aria-label="Monto">
          {tieneOperacion(expr) && <span class="expr num">{mostrar(expr)}</span>}
          <span class="disp num big2" data-testid="monto-reg">
            {monto == null ? (cta.moneda === 'USD' ? 'USD 0' : '$0') : fmtMon((tipo === 'ingreso' ? 1 : -1) * monto, cta.moneda, true)}
          </span>
        </button>
        {dobleMoneda && (
          <button class={`monto-reg chico${enDestino ? ' activo' : ''}`} onClick={() => setEnDestino(true)} aria-label={`Monto que entra en ${dst!.nombre}`}>
            {tieneOperacion(exprDest) && <span class="expr num">{mostrar(exprDest)}</span>}
            <span class="num">Entra {montoDest == null ? '—' : fmtMon(montoDest, dst!.moneda, true)}</span>
          </button>
        )}

        <div class="chips-reg">
          <button class="chip-g" aria-expanded={panel === 'tipo'} onClick={() => setPanel(panel === 'tipo' ? null : 'tipo')}>{NOM_TIPO[tipo]}<Icon n="chev" size={14} /></button>
          <button class="chip-g" aria-expanded={panel === 'cuenta'} onClick={() => setPanel(panel === 'cuenta' ? null : 'cuenta')}>{tipo === 'transferencia' ? 'Desde ' : ''}{cta.nombre}<Icon n="chev" size={14} /></button>
          <button class="chip-g" aria-expanded={panel === 'fecha'} onClick={() => setPanel(panel === 'fecha' ? null : 'fecha')}>
            {fecha === d.hoy ? 'Hoy' : fecha === ayer ? 'Ayer' : fmtDDMM(fecha)}<Icon n="chev" size={14} />
          </button>
          {pideTarjeta && <button class={`chip-g${nota ? ' sel' : ''}`} onClick={() => setPanel(panel === 'tarjeta' ? null : 'tarjeta')}>{nota || 'Tarjeta'}<Icon n="chev" size={14} /></button>}
          {!pideTarjeta && !conNota && <button class="chip-g" onClick={() => setConNota(true)}>+ Nota</button>}
        </div>
        {conNota && !pideTarjeta && (
          <input class="nota" type="text" maxLength={200} placeholder="Nota" value={nota} aria-label="Nota"
            onInput={(e) => setNota((e.target as HTMLInputElement).value)} />
        )}

        {error && <div class="msg" role="alert" data-testid="error-reg">{error}</div>}

        {panel === 'categoria' ? (
          <Categorias subcats={subcatsTipo} sel={subcat} elegir={(id) => { setSubcat(id); setPanel(id === 56 ? 'tarjeta' : null); setError(''); }} />
        ) : panel === 'tarjeta' ? (
          <Opciones items={d.tarjetas.map((t) => [t, t])} sel={nota} elegir={(t) => { setNota(String(t)); setPanel(null); setError(''); }} />
        ) : panel === 'tipo' ? (
          <Opciones items={(['gasto', 'ingreso', 'transferencia'] as Flujo[]).map((t) => [t, NOM_TIPO[t]])} sel={tipo} elegir={(t) => cambiarTipo(t as Flujo)} />
        ) : panel === 'cuenta' ? (
          <Opciones items={d.cuentas.map((c) => [c.id, c.nombre])} sel={cuenta}
            elegir={(c) => { setCuenta(Number(c)); if (destino === Number(c)) setDestino(Number(c) === 100 ? 101 : 100); setPanel(null); }} />
        ) : panel === 'destino' ? (
          <Opciones items={d.cuentas.filter((c) => c.id !== cuenta).map((c) => [c.id, c.nombre])} sel={destino ?? 0}
            elegir={(c) => { setDestino(Number(c)); setPanel(null); setError(''); }} />
        ) : panel === 'fecha' ? (
          <div class="opciones">
            <Opciones items={[[d.hoy, 'Hoy'], ...(ayer >= fechaMin ? [[ayer, 'Ayer'] as [string, string]] : [])]} sel={fecha} elegir={(f) => { setFecha(String(f)); setPanel(null); }} />
            <label class="small" style="display:flex;align-items:center;gap:8px">Otra
              <input type="date" class="nota" style="flex:1" min={d.desde ?? undefined} max={d.hoy} value={fecha}
                onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v) setFecha(v); }} />
            </label>
          </div>
        ) : (
          <div class="teclado" role="group" aria-label="Calculadora">
            {TECLAS.map(([t, txt, aria]) => (
              <button class={`k${'+-*/'.includes(t) ? ' op' : ''}`} aria-label={aria} onClick={() => tecla(t)} data-k={t}>
                {t === 'del' ? <Icon n="borrar" size={22} /> : txt}
              </button>
            ))}
            <button class="k op" aria-label="Igual" onClick={() => tecla('=')} data-k="=">=</button>
            <button class="btn guardar" disabled={enviando} onClick={guardar} data-testid="guardar">{enviando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Categorias({ subcats, sel, elegir }: { subcats: Subcat[]; sel: number | null; elegir: (id: number) => void }) {
  // primero las más usadas, después todas por grupo
  const top = [...subcats].filter((s) => (s.uso ?? 0) > 0).sort((a, b) => (b.uso ?? 0) - (a.uso ?? 0)).slice(0, 6);
  const grupos = new Map<string, Subcat[]>();
  for (const s of subcats) { if (!grupos.has(s.grupo)) grupos.set(s.grupo, []); grupos.get(s.grupo)!.push(s); }
  return (
    <div class="cats" data-testid="categorias">
      {top.length > 0 && <div class="cat-fila">{top.map((s) => <Chip s={s} sel={sel} elegir={elegir} />)}</div>}
      {[...grupos.entries()].map(([g, items]) => (
        <div><div class="eyebrow" style="margin:8px 0 6px">{g}</div><div class="cat-fila">{items.map((s) => <Chip s={s} sel={sel} elegir={elegir} />)}</div></div>
      ))}
    </div>
  );
}
function Chip({ s, sel, elegir }: { s: Subcat; sel: number | null; elegir: (id: number) => void }) {
  return <button class={`chip-g${sel === s.id ? ' sel' : ''}`} aria-pressed={sel === s.id} onClick={() => elegir(s.id)} data-subcat={s.id}>{s.nombre}</button>;
}
function Opciones({ items, sel, elegir }: { items: Array<[string | number, string]>; sel: string | number; elegir: (v: string | number) => void }) {
  return (
    <div class="cat-fila" style="padding:4px 0 8px">
      {items.map(([v, t]) => <button class={`chip-g${sel === v ? ' sel' : ''}`} aria-pressed={sel === v} onClick={() => elegir(v)}>{t}</button>)}
    </div>
  );
}
