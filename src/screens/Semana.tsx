import { useState } from 'preact/hooks';
import { api, type Snapshot } from '../api';
import { fmtAbrev, fmtDia, fmtEntero, fmtExacto, fmtPct, fmtUSD } from '../format';
import { Icon, Load, Monto, Tri, useAsync } from '../ui';

export function Semana() {
  const s = useAsync(() => api.snapshot(), []);
  return <Load a={s} que="el snapshot semanal" h={500}>{(d) => <SnapshotCard d={d} />}</Load>;
}

function SnapshotCard({ d }: { d: Snapshot }) {
  const [copiado, setCopiado] = useState(false);
  const menos = d.desvio_neto < 0;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(d.texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso */ }
  };
  return (
    <>
      <section class="card" aria-label="Snapshot semanal">
        <div>
          <h2 class="disp" style="font-size:20px">Snapshot semanal</h2>
          <div class="small num">{fmtDia(d.semana.desde)} – {fmtDia(d.semana.hasta)} · gastaste {fmtAbrev(d.gasto_semana)} (promedio {fmtAbrev(d.promedio_semanal)})</div>
        </div>
        <h3>Desvíos vs. tu promedio semanal</h3>
        <div class="small" style="margin-top:-6px">Promedio de las 13 semanas anteriores · ▲ gastaste más · ▼ gastaste menos</div>
        {d.desvios.length === 0 ? <div class="small">Sin desvíos relevantes esta semana.</div> : (
          <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
            {d.desvios.map((x) => {
              const mas = x.desvio > 0;
              const col = mas ? 'var(--bad)' : 'var(--good)';
              return (
                <li class="desv">
                  <span style="display:flex;align-items:center;gap:8px"><Tri up={mas} color={col} /><span class="sr">{mas ? 'Gastaste más en' : 'Gastaste menos en'}</span>{x.categoria}</span>
                  <Monto n={x.desvio} signoMas titulo={`${x.categoria}: desvío semanal`} cls={mas ? 'bad' : 'good'}
                    extra={[['Esta semana', fmtExacto(x.real)], ['Promedio', fmtExacto(x.promedio)], ['Desvío', fmtPct(x.desvio_pct, { signoMas: true })]]} />
                </li>
              );
            })}
          </ul>
        )}
        {(d.desvios_descartados ?? 0) > 0 && <div class="small">+ {d.desvios_descartados} categorías con desvíos chicos (no se muestran)</div>}
        <div class="num" style="font-size:15px">Desvío neto: <b class={menos ? 'good' : 'bad'}>{menos ? '▼ ' : '▲ '}{fmtAbrev(d.desvio_neto, { signoMas: true })}</b>{' '}
          <span class="muted" style="font-size:13px">({fmtPct(d.desvio_neto_pct, { signoMas: true })}) · {menos ? 'gastaste menos que lo habitual' : 'gastaste más que lo habitual'}</span></div>

        <h3 style="margin-top:6px">Compromisos · próximos 7 días · {fmtAbrev(d.compromisos_7d.total)}</h3>
        <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">
          {d.compromisos_7d.items.map((c) => (
            <li class="box" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;min-height:48px;padding:0 12px">
              <span style="font-size:13.5px"><span class="num muted">{fmtDia(c.fecha)} · </span>{c.tipo === 'fijo' ? 'Alquiler' : c.tarjeta || c.concepto}
                {c.monto_usd > 0 && <><br /><span class="small num">+ {fmtUSD(c.monto_usd)} de la reserva</span></>}</span>
              <Monto n={-c.monto_ars} titulo={`${c.tarjeta || c.concepto} · ${fmtDia(c.fecha)}`} cls="" />
            </li>
          ))}
        </ul>
        {d.proximo_valle && (
          <div class="alerta num">
            <Icon n="warn" size={18} color="var(--warn)" />
            <span><b>Próximo valle:</b> {fmtDia(d.proximo_valle.fecha)}, {fmtEntero(d.proximo_valle.saldo)} (central).
              {d.primer_dia_bajo_piso ? ` Perforás el piso el ${fmtDia(d.primer_dia_bajo_piso.fecha)}: ${d.primer_dia_bajo_piso.dias} días seguidos.` : ''}</span>
          </div>
        )}
      </section>
      <section class="card" aria-label="Texto para WhatsApp">
        <div class="cardhead"><h3>Texto del reporte</h3>
          <button class="linkbtn" onClick={copiar}><Icon n="copy" size={16} />&nbsp;{copiado ? 'Copiado' : 'Copiar'}</button></div>
        <pre class="wa">{d.texto}</pre>
      </section>
    </>
  );
}
