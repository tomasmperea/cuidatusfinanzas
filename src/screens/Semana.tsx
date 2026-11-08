import { api, type Snapshot } from '../api';
import { fmtAbrev, fmtDDMM, fmtDia, fmtEntero, fmtExacto, fmtPct, fmtUSD } from '../format';
import { useEffect, useState } from 'preact/hooks';
import { Icon, Load, Monto, Tri, useAsync } from '../ui';
import { activarPush, desactivarPush, estadoPush, probarPush, type EstadoPush } from '../push';

export function Semana() {
  const s = useAsync(() => api.snapshot(), []);
  return (
    <>
      <Load a={s} que="el snapshot semanal" h={500}>{(d) => <SnapshotCard d={d} />}</Load>
      <Recordatorio />
    </>
  );
}

function SnapshotCard({ d }: { d: Snapshot }) {
  const menos = d.desvio_neto < 0;
  return (
    <>
      <section class="card" aria-label="Gasto de la semana" style="gap:6px">
        <div class="cardhead">
          <h2 class="num">{fmtDDMM(d.semana.desde)} – {fmtDDMM(d.semana.hasta)}</h2>
          <Monto n={d.gasto_semana} titulo="Gasto de la semana" cls="disp"
            extra={[['Promedio semanal', fmtExacto(d.promedio_semanal)], ['Desvío', fmtExacto(d.desvio_neto, { signoMas: true })], ['Desvío %', fmtPct(d.desvio_neto_pct, { signoMas: true })]]} />
        </div>
        <div class="num" style="display:flex;align-items:center;gap:6px">
          <span class="sr">{menos ? 'Gastaste menos que tu promedio' : 'Gastaste más que tu promedio'}: </span>
          <Tri up={!menos} color={menos ? 'var(--good)' : 'var(--bad)'} />
          <b class={menos ? 'good' : 'bad'}>{fmtAbrev(d.desvio_neto, { signoMas: true })}</b>
          <span class="muted">vs. promedio {fmtAbrev(d.promedio_semanal)}</span>
        </div>
        {d.desvios.length > 0 && (
          <ul class="rows">
            {d.desvios.map((x) => {
              const mas = x.desvio > 0;
              return (
                <li class="fila1">
                  <Tri up={mas} color={mas ? 'var(--bad)' : 'var(--good)'} />
                  <span class="sr">{mas ? 'Más en' : 'Menos en'}</span>
                  <span class="ell" style="font-weight:500">{x.categoria}</span>
                  <Monto n={x.desvio} signoMas titulo={`${x.categoria}: desvío semanal`} cls={mas ? 'bad' : 'good'}
                    extra={[['Esta semana', fmtExacto(x.real)], ['Promedio', fmtExacto(x.promedio)], ['Desvío', fmtPct(x.desvio_pct, { signoMas: true })]]} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section class="card" aria-label="Próximos 7 días" style="gap:4px">
        <h2>Próximos 7 días</h2>
        <ul class="rows">
          {d.compromisos_7d.items.map((c) => {
            const nombre = c.tipo === 'fijo' ? 'Alquiler' : c.tarjeta || c.concepto;
            return (
              <li class="fila1">
                <span class="sr">{`${nombre}, ${fmtDia(c.fecha)}: ${fmtExacto(c.monto_ars)}${c.monto_usd > 0 ? ` más ${fmtUSD(c.monto_usd)} de la reserva` : ''}`}</span>
                <span class="num muted" style="flex:none;width:80px" aria-hidden="true">{fmtDia(c.fecha)}</span>
                <span class="ell" aria-hidden="true">{nombre}</span>
                <Monto n={c.monto_ars} titulo={`${nombre} · ${fmtDia(c.fecha)}`} usd={c.monto_usd > 0 ? `+ ${fmtUSD(c.monto_usd)} de la reserva` : undefined} />
              </li>
            );
          })}
        </ul>
      </section>
      {d.proximo_valle && (
        <div class="alerta num" style="margin:0 16px">
          <Icon n="warn" size={18} color="var(--warn)" />
          <span><b>Valle:</b> <span class="nw">{fmtEntero(d.proximo_valle.saldo)}</span> el {fmtDDMM(d.proximo_valle.fecha)}</span>
        </div>
      )}
    </>
  );
}

/** Recordatorio de los viernes 18:00 (notificación sin montos que abre esta pantalla). */
function Recordatorio() {
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
  if (estado === 'cargando' || estado === 'sin-configurar') return null;
  return (
    <section class="card" aria-label="Recordatorio semanal" data-testid="recordatorio" style="gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <Icon n="campana" size={22} />
        <div style="flex:1">
          <div style="font-weight:600">Recordatorio de los viernes</div>
          <div class="small">{estado === 'activo' ? 'Activado · 18:00' : estado === 'bloqueado' ? 'Bloqueado en los ajustes del teléfono'
            : estado === 'no-soportado' ? 'Instalá la app en el inicio para usarlo' : 'Desactivado'}</div>
        </div>
        {estado === 'inactivo' && <button class="btn" disabled={ocupado} onClick={() => hacer(activarPush, 'Listo, te aviso los viernes')} data-testid="push-activar">Activar</button>}
      </div>
      {estado === 'activo' && (
        <div style="display:flex;gap:8px">
          <button class="chip-g" disabled={ocupado} onClick={() => hacer(probarPush, 'Te mandé una de prueba')}>Probar</button>
          <button class="chip-g" disabled={ocupado} onClick={() => hacer(desactivarPush, 'Recordatorio desactivado')}>Desactivar</button>
        </div>
      )}
      {msg && <div class="small" role="status">{msg}</div>}
    </section>
  );
}
