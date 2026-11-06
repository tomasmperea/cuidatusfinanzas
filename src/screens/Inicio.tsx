import { api, type Ajustes, type Compromiso, type Escenario, type Kpis } from '../api';
import { Curva90 } from '../chart';
import { fmtAbrev, fmtDia, fmtEntero, fmtFechaHora, fmtExacto, fmtPct, fmtUSD, sumarDias } from '../format';
import { Icon, Load, Monto, OrigenChip, useAsync } from '../ui';
import { Frescura, normalizarTexto, SelectorEscenario } from './comunes';

export function Inicio({ esc, setEsc, irA }: { esc: Escenario; setEsc: (e: Escenario) => void; irA: (t: string) => void }) {
  const kpis = useAsync(() => api.kpis(esc), [esc]);
  const fc = useAsync(() => Promise.all([api.forecast(esc), api.forecast('conservador'), api.forecast('optimista')]), [esc]);
  const aj = useAsync(() => api.ajustes(), []);
  const comp = useAsync(() => api.compromisos(), []);

  return (
    <>
      {!kpis.error && <Load a={kpis} que="los indicadores" h={60}>{(k) => <Frescura b={k.backup} />}</Load>}
      <div class="pad"><SelectorEscenario esc={esc} setEsc={setEsc} /></div>
      <Load a={kpis} que="los indicadores" h={300}>{(k) => <><Aviso k={k} /><KpiGrid k={k} /></>}</Load>
      <Load a={fc} que="la curva de 90 días" h={240}>
        {([sel, con, opt]) => (
          <section class="card" aria-label="Próximos 90 días" style="padding:12px 12px 10px">
            <div class="cardhead"><h2>Próximos 90 días</h2><div class="small">Tocá un día</div></div>
            {kpis.data
              ? <Curva90 esc={esc} sel={sel} con={con} opt={opt} piso={kpis.data.piso.umbral} minimo={kpis.data.minimo_90d} />
              : <div class="small">Esperando los indicadores…</div>}
          </section>
        )}
      </Load>
      {/* Ajustes preventivos: solo si el RPC devuelve ítems; máximo 3. Si falla, no se muestra nada inventado. */}
      {esc !== 'central' ? (
        <div class="pad small" data-testid="ajustes-central">Los ajustes se calculan sobre el escenario central.</div>
      ) : aj.error ? <AjustesError reload={aj.reload} /> : aj.data && (aj.data.ajustes?.length ?? 0) > 0 && (
        <section class="card" aria-label="Ajustes preventivos" data-testid="ajustes">
          <div>
            <div class="eyebrow">Ajustes preventivos</div>
            <div class="small">{aj.data.disparo?.motivo ? `${aj.data.disparo.motivo}. ` : ''}Ideas para no perforar el piso, no un plan.
              {aj.data.estado === 'desactualizado' && aj.data.fecha_corrida ? ` Calculados el ${fmtDia(aj.data.fecha_corrida)}.` : ''}</div>
          </div>
          {aj.data.ajustes!.slice(0, 3).map((a, k) => (
            <div class="ajuste" key={a.id}>
              <span class="n" aria-hidden="true">{k + 1}</span>
              <div><div class="t">{normalizarTexto(a.titulo)}</div><div class="x num">{textoAjuste(a, aj.data!.base)}</div></div>
            </div>
          ))}
        </section>
      )}
      <Load a={comp} que="los próximos compromisos" h={200}>
        {(c) => <Proximos7 items={c} hoy={kpis.data?.hoy ?? c[0]?.fecha} irA={irA} />}
      </Load>
    </>
  );
}

/** Texto del ajuste: el tramo de impacto se arma desde los campos numéricos, con el formato de la app. */
function textoAjuste(a: NonNullable<Ajustes['ajustes']>[number], base?: Ajustes['base']) {
  const im = a.impacto;
  const sinImpacto = a.texto.replace(/\s*Mínimo:.*$/s, '');
  if (!im || !base) return normalizarTexto(a.texto);
  return <>{normalizarTexto(sinImpacto)} Mínimo: <span class="nw">{fmtAbrev(base.minimo)}</span> → <span class="nw">{fmtAbrev(im.minimo_nuevo)}</span> · días bajo el piso: {base.dias_bajo_piso} → {im.dias_bajo_piso_nuevo}.</>;
}

function AjustesError({ reload }: { reload: () => void }) {
  return (
    <section class="card" aria-label="Ajustes preventivos" role="status">
      <div class="eyebrow">Ajustes preventivos</div>
      <div class="small">No pudimos traer los ajustes. <button class="linkbtn" onClick={reload}>Reintentar</button></div>
    </section>
  );
}

function Aviso({ k }: { k: Kpis }) {
  const p = k.piso;
  if (!p.primer_dia_bajo_piso) {
    return (
      <section class="aviso ok" aria-label="Aviso de valle">
        <Icon n="ok" color="var(--good)" size={22} />
        <div class="num"><div class="tit">Sin valles bajo el piso en 90 días</div>
          <div class="det">Punto más bajo: <b>{fmtEntero(k.minimo_90d.saldo)}</b> el {fmtDia(k.minimo_90d.fecha)}.</div></div>
      </section>
    );
  }
  return (
    <section class="aviso" aria-label="Aviso de valle" data-testid="aviso">
      <div style="padding-top:2px"><Icon n="warn" color="var(--warn)" size={22} /></div>
      <div class="num" style="display:flex;flex-direction:column;gap:4px">
        <div class="tit">Aviso de valle: el {fmtDia(p.primer_dia_bajo_piso)} tu saldo perfora el piso de {fmtEntero(p.umbral)}</div>
        <div class="det">Punto más bajo: <b class="warn nw">{fmtEntero(k.minimo_90d.saldo)}</b> el {fmtDia(k.minimo_90d.fecha)} · {p.dias_bajo_piso} {p.dias_bajo_piso === 1 ? 'día' : 'días'} bajo el piso.</div>
      </div>
    </section>
  );
}

function KpiGrid({ k }: { k: Kpis }) {
  const s30 = k.saldo_neto_30d;
  const t = s30.tendencia;
  const neg = (n: number) => (n < 0 ? 'warn' : '');
  return (
    <section class="kpis" aria-label="Indicadores">
      <div class="kpi">
        <div class="eyebrow">Liquidez hoy</div>
        <Monto n={k.liquidez_hoy} titulo="Liquidez hoy" cls={`disp val ${neg(k.liquidez_hoy)}`}
          nota="Liquidez de hoy según el último backup." />
        <div class="sub num">Datos al {fmtFechaHora(k.backup.ultimo_movimiento)}</div>
      </div>
      <div class="kpi">
        <div class="eyebrow">Burn rate</div>
        <Monto n={k.burn_rate.diario} titulo="Burn rate por día" cls="disp val warn"
          extra={[['Por mes', fmtExacto(k.burn_rate.mensual)]]} nota="Gasto variable promedio proyectado para los próximos 90 días.">
          <small>/día</small>
        </Monto>
        <div class="sub num">{fmtAbrev(k.burn_rate.mensual)} por mes</div>
      </div>
      <div class="kpi">
        <div class="eyebrow">Saldo a 30 días</div>
        <Monto n={s30.saldo} titulo={`Saldo a 30 días (${fmtDia(s30.fecha)})`} cls={`disp val ${neg(s30.saldo)}`}
          extra={[
            ...(s30.variacion_pct != null ? [['Var. contra hoy', fmtPct(s30.variacion_pct, { signoMas: true })] as [string, string]] : []),
            ...(s30.variacion_monto != null ? [['Diferencia', fmtExacto(s30.variacion_monto, { signoMas: true })] as [string, string]] : []),
            ...(t?.delta != null ? [['Contra la proyección de ayer', fmtExacto(t.delta, { signoMas: true })] as [string, string]] : []),
          ]} />
        <div class="sub num">{fmtDia(s30.fecha)}{s30.variacion_pct != null && <> · Var {fmtPct(s30.variacion_pct, { signoMas: true })}</>}</div>
        <Tendencia t={t} />
      </div>
      <div class="kpi">
        <div class="eyebrow">Mínimo 90 días</div>
        <Monto n={k.minimo_90d.saldo} titulo={`Mínimo a 90 días (${fmtDia(k.minimo_90d.fecha)})`} cls={`disp val ${k.minimo_90d.saldo < k.piso.umbral ? 'warn' : ''}`} />
        <div class="sub num">{fmtDia(k.minimo_90d.fecha)}</div>
      </div>
    </section>
  );
}

function Tendencia({ t }: { t?: Kpis['saldo_neto_30d']['tendencia'] }) {
  if (!t || t.direccion === 'sin_datos' || t.delta == null) return <div class="sub">Tendencia: desde mañana</div>;
  const up = t.direccion ? t.direccion !== 'baja' && t.delta >= 0 : t.delta >= 0;
  const color = up ? 'var(--good)' : 'var(--bad)';
  return (
    <div class="trend num" style={{ color }}>
      <span aria-hidden="true">{t.simbolo || (up ? '▲' : '▼')}</span> {fmtAbrev(t.delta, { signoMas: true })} vs. ayer
    </div>
  );
}

export function nombreCompromiso(c: Compromiso): string {
  if (c.tipo === 'fijo') return c.concepto.startsWith('Alquiler') ? 'Alquiler' : c.concepto;
  return c.tarjeta || c.concepto;
}

export function extrasCompromiso(c: Compromiso, conCuotas = false): string[] {
  const out: string[] = [];
  const tj = c.detalle?.tarjetas as Array<{ tarjeta: string; monto_ars: number }> | undefined;
  if (tj?.length) out.push(tj.map((t) => `${t.tarjeta} ${fmtAbrev(t.monto_ars)}`).join(' + '));
  if (c.monto_usd > 0) out.push(`+ ${fmtUSD(c.monto_usd)} de la reserva`);
  if (conCuotas && c.detalle?.cuotas_informadas != null && c.origen === 'resumen_confirmado')
    out.push(`Cuotas ${fmtAbrev(c.detalle.cuotas_informadas)} · consumos ${fmtAbrev(c.detalle.consumos_informados ?? 0)}`);
  if (c.base?.includes('icl') && c.detalle?.icl_factor) out.push('Con ajuste ICL');
  return out;
}

export function detalleCompromiso(c: Compromiso): Array<[string, string]> {
  const x: Array<[string, string]> = [['Fecha de pago', fmtDia(c.fecha)]];
  if (c.vto_banco && c.vto_banco !== c.fecha) x.push(['Vencimiento del banco', fmtDia(c.vto_banco)]);
  const tj = c.detalle?.tarjetas as Array<{ tarjeta: string; monto_ars: number }> | undefined;
  tj?.forEach((t) => x.push([t.tarjeta, fmtExacto(t.monto_ars)]));
  if (c.detalle?.cuotas_informadas != null) x.push(['Cuotas informadas', fmtExacto(c.detalle.cuotas_informadas)]);
  if (c.detalle?.consumos_informados != null) x.push(['Consumos informados', fmtExacto(c.detalle.consumos_informados)]);
  if (c.detalle?.estimacion_no_cuota != null && c.origen !== 'resumen_confirmado') x.push(['Estimación (no cuotas)', fmtExacto(c.detalle.estimacion_no_cuota)]);
  if (c.monto_usd > 0) x.push(['En dólares (de la reserva)', fmtUSD(c.monto_usd)]);
  return x;
}

function Proximos7({ items, hoy, irA }: { items: Compromiso[]; hoy?: string; irA: (t: string) => void }) {
  const hasta = hoy ? sumarDias(hoy, 7) : '';
  const prox = items.filter((c) => !hoy || (c.fecha >= hoy && c.fecha <= hasta));
  return (
    <section class="card" aria-label="Próximos 7 días">
      <div class="cardhead"><h2>Próximos 7 días</h2><button class="linkbtn" onClick={() => irA('compromisos')}>Ver los 90 días</button></div>
      {prox.length === 0 ? <div class="small">No hay compromisos en los próximos 7 días.</div> : (
        <ul class="rows">
          {prox.map((c) => <FilaCompromiso c={c} />)}
        </ul>
      )}
    </section>
  );
}

export function FilaCompromiso({ c, conCuotas }: { c: Compromiso; conCuotas?: boolean }) {
  const [dow, ddmm] = fmtDia(c.fecha).split(' ');
  return (
    <li class="row">
      <span class="fecha num">{dow}<b>{ddmm}</b></span>
      <span style="display:flex;flex-direction:column;gap:3px;min-width:0">
        <span class="nombre">{nombreCompromiso(c)}</span>
        <span><OrigenChip origen={c.origen} estado={c.estado_ciclo} base={c.base} /></span>
        {extrasCompromiso(c, conCuotas).map((e) => <span class="extra num">{e}</span>)}
      </span>
      <Monto n={c.monto_ars} titulo={nombreCompromiso(c)} cls="monto" extra={detalleCompromiso(c)} />
    </li>
  );
}
