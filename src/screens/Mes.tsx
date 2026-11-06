import { useEffect, useState } from 'preact/hooks';
import { api, type CalDia, type Calendario, type Escenario, type IngresosEgresos, type LiquidezComprometida } from '../api';
import { fmtAbrev, fmtCompacto, fmtDDMM, fmtDia, fmtDiaCap, fmtExacto, fmtMes, fmtPct, nombreMes } from '../format';
import { Load, Monto, OrigenChip, useAsync } from '../ui';
import { SelectorEscenario } from './comunes';

const NOM: Record<string, string> = { central: 'central', conservador: 'conservador', optimista: 'optimista' };

export function Mes({ esc, setEsc, diaInicial }: { esc: Escenario; setEsc: (e: Escenario) => void; diaInicial?: string }) {
  const cal = useAsync(() => api.calendario(esc), [esc]);
  const ie = useAsync(() => api.ingresosEgresos(), []);
  const lc = useAsync(() => api.liquidezComprometida(), []);
  return (
    <>
      <div class="pad"><SelectorEscenario esc={esc} setEsc={setEsc} /></div>
      <Load a={cal} que="el calendario" h={420}>{(c) => <CalendarioMes c={c} diaInicial={diaInicial} />}</Load>
      <Load a={ie} que="ingresos vs. egresos" h={220}>{(d) => <IngresosEgresosCard d={d} />}</Load>
      <Load a={lc} que="la liquidez comprometida" h={260}>{(d) => <Comprometida d={d} />}</Load>
    </>
  );
}

function ultimoReal(c: Calendario): string | null {
  const r = c.dias.filter((d) => d.tipo !== 'proyectado');
  return r.length ? r[r.length - 1].fecha : null;
}

function CalendarioMes({ c, diaInicial }: { c: Calendario; diaInicial?: string }) {
  const [sel, setSel] = useState<string>(diaInicial && c.dias.some((d) => d.fecha === diaInicial) ? diaInicial : c.hoy);
  useEffect(() => { if (!c.dias.some((d) => d.fecha === sel)) setSel(c.dias[0]?.fecha); }, [c]);
  const primero = c.dias[0];
  const offset = primero ? primero.dia_semana - 1 : 0;
  const real = ultimoReal(c);
  const dia = c.dias.find((d) => d.fecha === sel);
  return (
    <>
      <section class="card" aria-label="Calendario del mes">
        <div>
          <h2>{fmtMes(c.mes)}</h2>
          <div class="small">Saldo al cierre de cada día · {real ? `real hasta el ${fmtDDMM(real)}, después proyectado` : 'proyectado'} ({NOM[c.escenario]})</div>
        </div>
        <div class="cal" role="grid" aria-label={`Calendario de ${nombreMes(c.mes)}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => <div class="dow" aria-hidden="true">{d}</div>)}
          {Array.from({ length: offset }).map(() => <div class="vacio" />)}
          {c.dias.map((d) => <Celda d={d} hoy={c.hoy} sel={sel === d.fecha} onSel={() => setSel(d.fecha)} />)}
        </div>
        <div class="legend">
          <span><b aria-hidden="true">▼</b> Egreso / compromiso</span>
          <span><b aria-hidden="true">▲</b> Ingreso</span>
          <span><span class="sw" style="background:repeating-linear-gradient(45deg,var(--warn-line) 0 2px,var(--warn-soft) 2px 4px);border:1px solid var(--warn-line)" />! Bajo el piso ({fmtAbrev(c.piso)})</span>
        </div>
        {c.resumen.primer_dia_bajo_piso && (
          <div class="small num">Bajo el piso desde el {fmtDia(c.resumen.primer_dia_bajo_piso)}: {c.resumen.dias_bajo_piso} días este mes. Mínimo del mes: {fmtAbrev(c.resumen.minimo)} el {fmtDDMM(c.resumen.fecha_minimo)}.</div>
        )}
      </section>
      {dia && <DiaSeleccionado d={dia} piso={c.piso} />}
    </>
  );
}

function Celda({ d, hoy, sel, onSel }: { d: CalDia; hoy: string; sel: boolean; onSel: () => void }) {
  const egr = d.eventos.some((e) => e.signo < 0 && e.tipo !== 'sin_backup');
  const ing = d.eventos.some((e) => e.signo > 0);
  const n = Number(d.fecha.slice(8, 10));
  const cls = [d.bajo_piso ? 'bajo' : '', d.fecha === hoy ? 'hoy' : '', d.tipo === 'proyectado' ? 'proy' : ''].join(' ');
  const label = `${fmtDia(d.fecha)}${d.fecha === hoy ? ' (hoy)' : ''}: saldo ${fmtExacto(d.saldo_cierre)}` +
    `${d.bajo_piso ? ', bajo el piso' : ''}${ing ? ', con ingreso' : ''}${egr ? ', con egreso' : ''}`;
  return (
    <button class={cls} aria-pressed={sel} aria-label={label} onClick={onSel} data-fecha={d.fecha}>
      <span class="d">{n}{d.bajo_piso && <span class="warn" aria-hidden="true">!</span>}</span>
      <span class="s num">{fmtCompacto(d.saldo_cierre)}</span>
      <span class="mk" aria-hidden="true">{ing && <span class="good">▲</span>}{egr && <span class="warn">▼</span>}</span>
    </button>
  );
}

function DiaSeleccionado({ d, piso }: { d: CalDia; piso: number }) {
  const tipo = d.tipo === 'real' ? 'Saldo real' : d.tipo === 'sin_backup' ? 'Saldo (sin backup, último real)' : 'Saldo proyectado';
  return (
    <section class="card" aria-label="Día seleccionado" aria-live="polite" data-testid="dia">
      <div class="cardhead">
        <div><div class="eyebrow">Día seleccionado</div><h3 class="disp" style="font-size:20px">{fmtDiaCap(d.fecha)}</h3></div>
        {d.bajo_piso && <span class="chip" style="border-color:var(--warn-line);background:var(--warn-soft)">! Bajo el piso</span>}
      </div>
      <div class="num">{tipo}: <Monto n={d.saldo_cierre} titulo={`${tipo} · ${fmtDia(d.fecha)}`} cls={`disp ${d.saldo_cierre < piso ? 'warn' : ''}`}
        extra={[['Ingresos del día', fmtExacto(d.ingresos, { signoMas: true })], ['Egresos del día', fmtExacto(-d.egresos)]]} /></div>
      {d.eventos.length > 0 ? (
        <ul class="rows">
          {d.eventos.map((e) => (
            <li style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;min-height:48px;padding:6px 0">
              <span style="display:flex;flex-direction:column;gap:3px">
                <span>{e.signo > 0 ? '▲ ' : '▼ '}{e.tipo === 'tarjeta' && e.tarjeta ? `${e.tarjeta} · resumen` : e.concepto}</span>
                {e.monto_usd ? <span class="small num">+ USD {e.monto_usd.toLocaleString('es-AR', { minimumFractionDigits: 2 })} de la reserva</span> : null}
                {e.origen && e.tipo !== 'sin_backup' && <span><OrigenChip origen={e.origen} estado={e.estado_ciclo} /></span>}
              </span>
              <span class={`num ${e.signo > 0 ? 'good' : ''}`} style="font-weight:650">{fmtExacto(e.signo * e.monto, { signoMas: true })}</span>
            </li>
          ))}
        </ul>
      ) : <div class="small">Sin ingresos ni compromisos este día.</div>}
      <div class="small num">Total del día: ingresos {fmtExacto(d.ingresos, { signoMas: true })} · egresos {fmtExacto(-d.egresos)} (incluye gasto variable{d.tipo === 'proyectado' ? ' estimado' : ''})</div>
    </section>
  );
}

function IngresosEgresosCard({ d }: { d: IngresosEgresos }) {
  const t = d.total;
  const f = t.egresos_fijos;
  const sueldo = d.detalle.find((x) => x.grupo === 'ingreso_recurrente');
  const libreNeg = t.liquidez_libre < 0;
  const conOtros = t.liquidez_libre_con_otros_ingresos;
  const partes = [
    f.tarjetas ? `tarjetas ${fmtAbrev(f.tarjetas)}` : '', f.vivienda ? `alquiler ${fmtAbrev(f.vivienda)}` : '',
    f.servicios ? `servicios ${fmtAbrev(f.servicios)}` : '', f.prestamos ? `préstamos ${fmtAbrev(f.prestamos)}` : '',
  ].filter(Boolean).join(' · ');
  const max = Math.max(t.ingresos_recurrentes.total, f.total + t.gasto_variable, 1);
  return (
    <section class="card" aria-label="Ingresos vs. egresos">
      <div>
        <h2>Ingresos vs. egresos</h2>
        <div class="small">{nombreMes(d.mes).replace(/^./, (c) => c.toUpperCase())} · {d.estado_mes === 'en_curso' ? `real hasta el ${fmtDDMM(d.real_hasta)} + proyectado` : d.estado_mes === 'cerrado' ? 'cerrado' : 'proyectado'}{d.escenario ? ` · escenario ${d.escenario}` : ''}</div>
      </div>
      <div role="img" aria-label={`Ingresos ${fmtAbrev(t.ingresos_recurrentes.total)}; egresos fijos ${fmtAbrev(f.total)} y gasto variable ${fmtAbrev(t.gasto_variable)}`} style="display:flex;flex-direction:column;gap:4px">
        <div class="stack"><span style={{ flex: `0 0 ${(100 * t.ingresos_recurrentes.total) / max}%`, background: 'var(--good)' }} /></div>
        <div class="stack">
          <span style={{ flex: `0 0 ${(100 * f.total) / max}%`, background: 'var(--accent-strong)' }} />
          <span style={{ flex: `0 0 ${(100 * t.gasto_variable) / max}%`, background: 'var(--accent-mid)' }} />
        </div>
      </div>
      <div class="kv num">
        <span class="k"><span class="sw" style="background:var(--good)" /> ▲ Ingresos recurrentes</span>
        <Monto n={t.ingresos_recurrentes.total} titulo="Ingresos recurrentes del mes" cls="v"
          extra={[['Sueldo', fmtExacto(t.ingresos_recurrentes.sueldo)], ['Aguinaldo', fmtExacto(t.ingresos_recurrentes.aguinaldo)]]} />
        <span class="d">{sueldo ? `${sueldo.concepto} del ${fmtDDMM(sueldo.fecha)}${sueldo.fuente === 'proyectado' ? ' (proyectado)' : ''}` : 'Sueldo y aguinaldo'}</span>
        <span class="k"><span class="sw" style="background:var(--accent-strong)" /> ▼ Egresos fijos</span>
        <Monto n={f.total} titulo="Egresos fijos del mes" cls="v"
          extra={[['Tarjetas', fmtExacto(f.tarjetas)], ['Vivienda', fmtExacto(f.vivienda)], ['Servicios', fmtExacto(f.servicios)], ['Préstamos', fmtExacto(f.prestamos)],
            ...(f.tarjetas_usd ? [['Tarjetas en USD (de la reserva)', `USD ${f.tarjetas_usd.toLocaleString('es-AR')}`] as [string, string]] : [])]} />
        <span class="d">{partes || 'Sin egresos fijos'}</span>
        <span class="k"><span class="sw" style="background:var(--accent-mid)" /> ▼ Gasto variable{d.estado_mes !== 'cerrado' ? ' estimado' : ''}</span>
        <Monto n={t.gasto_variable} titulo="Gasto variable del mes" cls="v"
          extra={[['Real', fmtExacto(d.real.gasto_variable)], ['Proyectado', fmtExacto(d.proyectado.gasto_variable)]]} />
        <span class="d" />
      </div>
      <div style="border-top:1px solid var(--line);padding-top:8px" class="kv num">
        <span class="k" style="font-weight:650">Liquidez libre</span>
        <Monto n={t.liquidez_libre} titulo="Liquidez libre del mes" cls={`v disp ${libreNeg ? 'warn' : 'good'}`}
          extra={[['Otros ingresos', fmtExacto(t.otros_ingresos)], ['Con otros ingresos', fmtExacto(conOtros)]]} />
        <span class="d">Ingresos recurrentes − fijos − variable. Con otros ingresos ({fmtAbrev(t.otros_ingresos)}) queda en {fmtAbrev(conOtros)}.{conOtros < 0 ? ' Lo cubre la liquidez que ya tenés.' : ''}</span>
      </div>
    </section>
  );
}

const COLOR: Record<string, string> = {
  vivienda: 'var(--neutral-bar)', prestamos: 'var(--muted)', servicios: 'var(--accent-mid)',
  cuotas_tarjeta: 'var(--accent-strong)', tarjeta_resto: 'var(--accent)', disponible_libre: 'var(--good)',
};
const SUB: Record<string, string> = {
  vivienda: 'Alquiler y expensas', prestamos: 'Préstamos activos', servicios: 'Real + recurrentes del mes',
  cuotas_tarjeta: 'De los resúmenes del mes', tarjeta_resto: 'Consumos en 1 pago, débitos e impuestos', disponible_libre: 'Antes del gasto variable',
};

function Comprometida({ d }: { d: LiquidezComprometida }) {
  return (
    <section class="card" aria-label="Liquidez comprometida">
      <div>
        <h2>Liquidez comprometida</h2>
        <div class="small num">Del ingreso mensual ({fmtAbrev(d.ingreso_mensual)}) te quedan libres {fmtAbrev(d.disponible_libre)} antes del gasto variable.
          {d.proximo_cobro ? ` Próximo cobro: ${fmtDia(d.proximo_cobro.fecha)}.` : ''}</div>
      </div>
      <div class="stack" role="img" aria-label="Reparto del ingreso mensual">
        {d.grupos.filter((g) => g.monto > 0).map((g) => <span style={{ flex: `${Math.max(g.pct_ingreso, 0)} 1 0`, background: COLOR[g.grupo] || 'var(--muted)' }} />)}
      </div>
      <ul class="rows">
        {d.grupos.map((g) => (
          <li style="display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;min-height:52px">
            <span class="sw" style={{ background: COLOR[g.grupo] || 'var(--muted)' }} />
            <span style="display:flex;flex-direction:column"><span>{g.grupo === 'tarjeta_resto' ? 'Tarjeta · resto' : g.grupo === 'disponible_libre' ? 'Disponible libre' : g.nombre}</span>
              <span class="small">{g.monto === 0 && g.grupo === 'prestamos' ? 'Sin préstamos activos' : SUB[g.grupo] || ''}</span></span>
            <span style="display:flex;flex-direction:column;align-items:flex-end">
              <Monto n={g.monto} titulo={g.nombre} cls="" nota={g.nota} extra={[['Del ingreso', fmtPct(g.pct_ingreso)]]} />
              <span class="small num" style="margin-top:-10px">{fmtPct(g.pct_ingreso)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div class="small num">Total tarjetas del mes: {fmtAbrev(d.tarjeta_total.monto)}{d.tarjeta_total.usd ? ` + USD ${d.tarjeta_total.usd.toLocaleString('es-AR')} de la reserva` : ''}.
        {d.cuotas_futuras ? ` Cuotas que vencen después: ${fmtAbrev(d.cuotas_futuras.monto)} (hasta ${fmtDDMM(d.cuotas_futuras.hasta)}/${d.cuotas_futuras.hasta.slice(2, 4)}).` : ''}</div>
    </section>
  );
}
