import { useEffect, useState } from 'preact/hooks';
import { api, type CalDia, type Calendario, type Escenario, type IngresosEgresos, type LiquidezComprometida } from '../api';
import { fmtAbrev, fmtCompacto, fmtDDMM, fmtDia, fmtDiaCap, fmtExacto, fmtMes, fmtPct, nombreMes } from '../format';
import { Load, Monto, useAsync } from '../ui';
import { SelectorEscenario } from './comunes';
import { origenTexto } from './Inicio';

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

function CalendarioMes({ c, diaInicial }: { c: Calendario; diaInicial?: string }) {
  const [sel, setSel] = useState<string>(diaInicial && c.dias.some((d) => d.fecha === diaInicial) ? diaInicial : c.hoy);
  useEffect(() => { if (!c.dias.some((d) => d.fecha === sel)) setSel(c.dias[0]?.fecha); }, [c]);
  const offset = c.dias[0] ? c.dias[0].dia_semana - 1 : 0;
  const dia = c.dias.find((d) => d.fecha === sel);
  const proy = c.dias.filter((d) => d.tipo === 'proyectado' && d.bajo_piso).length;
  return (
    <>
      <section class="card" aria-label="Calendario del mes" style="padding:14px 10px">
        <h2 style="padding-left:4px">{fmtMes(c.mes)}</h2>
        <span class="sr">Saldo al cierre de cada día, escenario {c.escenario}. Días con rayado: bajo el piso de {fmtExacto(c.piso)}
          {proy ? ` (${proy} días proyectados en ${nombreMes(c.mes)})` : ''}.</span>
        <div class="cal" role="group" aria-label={`Días de ${nombreMes(c.mes)}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => <div class="dow" aria-hidden="true">{d}</div>)}
          {Array.from({ length: offset }).map(() => <div class="vacio" />)}
          {c.dias.map((d) => <Celda d={d} hoy={c.hoy} sel={sel === d.fecha} onSel={() => setSel(d.fecha)} />)}
        </div>
      </section>
      {dia && <DiaSeleccionado d={dia} piso={c.piso} />}
    </>
  );
}

function Celda({ d, hoy, sel, onSel }: { d: CalDia; hoy: string; sel: boolean; onSel: () => void }) {
  const n = Number(d.fecha.slice(8, 10));
  const cls = [d.bajo_piso ? 'bajo' : '', d.fecha === hoy ? 'hoy' : '', d.tipo === 'proyectado' ? 'proy' : ''].join(' ');
  const ev = d.eventos.filter((e) => e.tipo !== 'sin_backup');
  const label = `${fmtDia(d.fecha)}${d.fecha === hoy ? ' (hoy)' : ''}: saldo ${d.tipo === 'proyectado' ? 'proyectado ' : ''}${fmtExacto(d.saldo_cierre)}` +
    `${d.bajo_piso ? ', bajo el piso' : ''}${ev.length ? `, ${ev.length} ${ev.length === 1 ? 'movimiento' : 'movimientos'}` : ''}`;
  return (
    <button class={cls} aria-pressed={sel} aria-label={label} onClick={onSel} data-fecha={d.fecha}>
      <span class="d">{n}</span>
      <span class="s num">{fmtCompacto(d.saldo_cierre)}</span>
    </button>
  );
}

function DiaSeleccionado({ d, piso }: { d: CalDia; piso: number }) {
  const ev = d.eventos.filter((e) => e.tipo !== 'sin_backup');
  return (
    <section class="card" aria-label="Día seleccionado" aria-live="polite" data-testid="dia" style="gap:4px">
      <div class="cardhead">
        <h2>{fmtDiaCap(d.fecha)}</h2>
        <Monto n={d.saldo_cierre} titulo={`Saldo ${d.tipo === 'proyectado' ? 'proyectado' : 'real'} · ${fmtDia(d.fecha)}`}
          cls={`disp ${d.saldo_cierre < piso ? 'warn' : ''}`}
          extra={[['Ingresos del día', fmtExacto(d.ingresos, { signoMas: true })], ['Egresos del día (con gasto variable)', fmtExacto(-d.egresos)]]} />
      </div>
      {ev.length > 0 && (
        <ul class="rows">
          {ev.map((e) => {
            const nombre = e.tipo === 'tarjeta' && e.tarjeta ? e.tarjeta : e.concepto;
            return (
              <li class="fila1">
                <span class="sr">{`${e.signo > 0 ? 'Ingreso' : 'Egreso'}: ${nombre}, ${fmtExacto(e.signo * e.monto)}${e.monto_usd ? ` más USD ${e.monto_usd} de la reserva` : ''}. ${origenTexto(e.origen)}.`}</span>
                <span class="ell" style="font-weight:500" aria-hidden="true">{nombre}</span>
                <span class={`num ${e.signo > 0 ? 'good' : ''}`} style="font-weight:650" aria-hidden="true">{fmtAbrev(e.signo * e.monto, { signoMas: true })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IngresosEgresosCard({ d }: { d: IngresosEgresos }) {
  const t = d.total;
  const f = t.egresos_fijos;
  const filas: Array<[string, number, string, Array<[string, string]>]> = [
    ['Ingresos', t.ingresos_recurrentes.total, 'good', [['Sueldo', fmtExacto(t.ingresos_recurrentes.sueldo)], ['Aguinaldo', fmtExacto(t.ingresos_recurrentes.aguinaldo)]]],
    ['Fijos', -f.total, '', [['Tarjetas', fmtExacto(f.tarjetas)], ['Vivienda', fmtExacto(f.vivienda)], ['Servicios', fmtExacto(f.servicios)], ['Préstamos', fmtExacto(f.prestamos)]]],
    ['Variable', -t.gasto_variable, '', [['Real', fmtExacto(d.real.gasto_variable)], ['Proyectado', fmtExacto(d.proyectado.gasto_variable)]]],
  ];
  return (
    <section class="card" aria-label={`Ingresos vs. egresos de ${nombreMes(d.mes)}, real hasta el ${fmtDDMM(d.real_hasta)} más proyectado`} style="gap:4px">
      <h2>Ingresos vs. egresos</h2>
      <ul class="rows">
        {filas.map(([k, v, c, ex]) => (
          <li class="fila1"><span class="ell" style="font-weight:500">{k}</span><Monto n={v} titulo={k} cls={c} signoMas extra={ex} /></li>
        ))}
        <li class="fila1"><span class="ell">Libre</span>
          <Monto n={t.liquidez_libre} titulo="Liquidez libre del mes" cls={`disp ${t.liquidez_libre < 0 ? 'warn' : 'good'}`}
            extra={[['Otros ingresos', fmtExacto(t.otros_ingresos)], ['Con otros ingresos', fmtExacto(t.liquidez_libre_con_otros_ingresos)]]} />
        </li>
      </ul>
    </section>
  );
}

const COLOR: Record<string, string> = {
  vivienda: 'var(--neutral-bar)', prestamos: 'var(--muted)', servicios: 'var(--accent-mid)',
  cuotas_tarjeta: 'var(--accent-strong)', tarjeta_resto: 'var(--accent)', disponible_libre: 'var(--good)',
};
const CORTO: Record<string, string> = { tarjeta_resto: 'Tarjeta · resto', disponible_libre: 'Disponible', cuotas_tarjeta: 'Cuotas' };

function Comprometida({ d }: { d: LiquidezComprometida }) {
  return (
    <section class="card" aria-label="Liquidez comprometida" style="gap:6px">
      <div class="cardhead"><h2>Liquidez comprometida</h2><span class="small num">de {fmtAbrev(d.ingreso_mensual)}</span></div>
      <div class="stack" aria-hidden="true">
        {d.grupos.filter((g) => g.monto > 0).map((g) => <span style={{ flex: `${Math.max(g.pct_ingreso, 0)} 1 0`, background: COLOR[g.grupo] || 'var(--muted)' }} />)}
      </div>
      <ul class="rows">
        {d.grupos.filter((g) => g.monto !== 0).map((g) => (
          <li class="fila1">
            <span class="sw" aria-hidden="true" style={{ background: COLOR[g.grupo] || 'var(--muted)' }} />
            <span class="ell" style="font-weight:500">{CORTO[g.grupo] || g.nombre}</span>
            <span class="small num" aria-hidden="true">{fmtPct(g.pct_ingreso)}</span>
            <Monto n={g.monto} titulo={g.nombre} nota={g.nota} extra={[['Del ingreso', fmtPct(g.pct_ingreso)]]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
