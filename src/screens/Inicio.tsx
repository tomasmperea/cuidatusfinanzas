import { api, type Ajustes, type Compromiso, type Escenario, type Kpis } from '../api';
import { Curva90 } from '../chart';
import { fmtAbrev, fmtDDMM, fmtDia, fmtEntero, fmtExacto, fmtPct, fmtUSD, normalizarTexto, sumarDias } from '../format';
import { Icon, Load, Monto, useAsync } from '../ui';
import { Frescura, SelectorEscenario } from './comunes';

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
          <section class="card" aria-label="Próximos 90 días. Tocá un día para ver el saldo." style="padding:12px 12px 10px">
            <h2>Próximos 90 días</h2>
            {kpis.data && <Curva90 esc={esc} sel={sel} con={con} opt={opt} piso={kpis.data.piso.umbral} minimo={kpis.data.minimo_90d} />}
          </section>
        )}
      </Load>
      {/* Ajustes preventivos: del escenario central; solo si el RPC devuelve ítems (máx. 3). */}
      {esc !== 'central' ? (
        <div class="pad small" data-testid="ajustes-central">Los ajustes se calculan sobre el escenario central.</div>
      ) : aj.error ? <AjustesError reload={aj.reload} /> : aj.data && (aj.data.ajustes?.length ?? 0) > 0 && (
        <section class="card" aria-label="Ajustes preventivos" data-testid="ajustes" style="gap:4px">
          <h2>Ajustes preventivos</h2>
          <ul class="rows">
            {aj.data.ajustes!.slice(0, 3).map((a) => <FilaAjuste a={a} />)}
          </ul>
        </section>
      )}
      <Load a={comp} que="los próximos compromisos" h={200}>
        {(c) => <Proximos7 items={c} hoy={kpis.data?.hoy ?? c[0]?.fecha} irA={irA} />}
      </Load>
    </>
  );
}

function FilaAjuste({ a }: { a: NonNullable<Ajustes['ajustes']>[number] }) {
  const titulo = normalizarTexto(a.titulo);
  const delta = a.impacto?.delta_minimo;
  const label = `${titulo}. ${normalizarTexto(a.texto)}${delta != null ? ` Mejora el mínimo en ${fmtExacto(delta)}.` : ''}`;
  return (
    <li class="fila1">
      <span class="sr">{label}</span>
      <span class="ell" aria-hidden="true">{titulo}</span>
      {delta != null && <span class="num good" style="font-weight:650" aria-hidden="true">{fmtAbrev(delta, { signoMas: true })}</span>}
    </li>
  );
}

function AjustesError({ reload }: { reload: () => void }) {
  return (
    <section class="card" aria-label="Ajustes preventivos" role="status">
      <h2>Ajustes preventivos</h2>
      <div class="small">No pudimos cargar esta sección. <button class="linkbtn" onClick={reload}>Reintentar</button></div>
    </section>
  );
}

function Aviso({ k }: { k: Kpis }) {
  const p = k.piso;
  const min = <span class="nw">{fmtEntero(k.minimo_90d.saldo)}</span>;
  if (!p.primer_dia_bajo_piso) {
    return (
      <section class="aviso ok" aria-label="Aviso de valle">
        <span class="sr">{`Sin valles bajo el piso en 90 días. Mínimo ${fmtExacto(k.minimo_90d.saldo)} el ${fmtDia(k.minimo_90d.fecha)}.`}</span>
        <Icon n="ok" color="var(--good)" size={22} />
        <div class="num" aria-hidden="true"><div class="tit">No perforás el piso</div><div class="det">Mínimo {min} el {fmtDDMM(k.minimo_90d.fecha)}</div></div>
      </section>
    );
  }
  return (
    <section class="aviso" data-testid="aviso" aria-label="Aviso de valle">
      <span class="sr">{`El ${fmtDia(p.primer_dia_bajo_piso)} tu saldo perfora el piso de ${fmtEntero(p.umbral)}. ` +
        `Mínimo ${fmtExacto(k.minimo_90d.saldo)} el ${fmtDia(k.minimo_90d.fecha)}; ${p.dias_bajo_piso} días bajo el piso en 90 días.`}</span>
      <div style="padding-top:2px"><Icon n="warn" color="var(--warn)" size={22} /></div>
      <div class="num" aria-hidden="true" style="display:flex;flex-direction:column;gap:2px">
        <div class="tit">Perforás el piso el {fmtDia(p.primer_dia_bajo_piso)}</div>
        <div class="det">Mínimo <b class="warn">{min}</b> el {fmtDDMM(k.minimo_90d.fecha)}</div>
      </div>
    </section>
  );
}

function KpiGrid({ k }: { k: Kpis }) {
  const s30 = k.saldo_neto_30d;
  const t = s30.tendencia;
  const warn = (n: number) => (n < k.piso.umbral ? 'warn' : '');
  const conTend = t && t.direccion !== 'sin_datos' && t.delta != null;
  return (
    <section class="kpis" aria-label="Indicadores">
      <div class="kpi">
        <div class="eyebrow">Liquidez</div>
        <Monto n={k.liquidez_hoy} titulo="Liquidez hoy" cls={`disp val ${k.liquidez_hoy < 0 ? 'warn' : ''}`}
          extra={[['Datos al', fmtDDMM(k.backup.ultimo_movimiento || k.hoy)]]} />
      </div>
      <div class="kpi">
        <div class="eyebrow">Burn rate</div>
        <Monto n={k.burn_rate.diario} titulo="Burn rate por día" cls="disp val warn"
          extra={[['Por mes', fmtExacto(k.burn_rate.mensual)]]}><small>/día</small></Monto>
      </div>
      <div class="kpi">
        <div class="eyebrow">A 30 días</div>
        <Monto n={s30.saldo} titulo={`Saldo a 30 días (${fmtDia(s30.fecha)})`} cls={`disp val ${warn(s30.saldo)}`}
          extra={[
            ...(s30.variacion_pct != null ? [['Var. contra hoy', fmtPct(s30.variacion_pct, { signoMas: true })] as [string, string]] : []),
            ...(s30.variacion_monto != null ? [['Diferencia', fmtExacto(s30.variacion_monto, { signoMas: true })] as [string, string]] : []),
            ...(conTend ? [['Contra la proyección de ayer', fmtExacto(t!.delta!, { signoMas: true })] as [string, string]] : []),
          ]} />
        {(s30.variacion_pct != null || conTend) && (
          <div class="sub num"><span class="sr">{`Variación ${fmtPct(s30.variacion_pct, { signoMas: true })} contra hoy${conTend ? `; tendencia ${t!.delta! >= 0 ? 'al alza' : 'a la baja'} ${fmtExacto(t!.delta!, { signoMas: true })} contra ayer` : ''}`}</span>
            {conTend && <span aria-hidden="true" class={t!.delta! >= 0 ? 'good' : 'bad'}>{t!.delta! >= 0 ? '▲ ' : '▼ '}</span>}
            <span aria-hidden="true">{fmtPct(s30.variacion_pct, { signoMas: true })}</span>
          </div>
        )}
      </div>
      <div class="kpi">
        <div class="eyebrow">Mínimo 90 días</div>
        <span style="display:flex;flex-wrap:wrap;align-items:center;column-gap:6px;min-width:0">
          <Monto n={k.minimo_90d.saldo} titulo={`Mínimo a 90 días (${fmtDia(k.minimo_90d.fecha)})`} cls={`disp val ${warn(k.minimo_90d.saldo)}`} />
          <span class="sub num">{fmtDDMM(k.minimo_90d.fecha)}</span>
        </span>
      </div>
    </section>
  );
}

export function nombreCompromiso(c: Compromiso): string {
  if (c.tipo === 'fijo') return c.concepto.startsWith('Alquiler') ? 'Alquiler' : c.concepto;
  return c.tarjeta || c.concepto;
}

export function esPagado(c: { estado?: string; estado_ciclo?: string }): boolean {
  return c.estado === 'pagado' || c.estado_ciclo === 'pagado';
}

const ORIGEN: Record<string, string> = {
  resumen_confirmado: 'resumen confirmado', estimado: 'estimado', fijo_estimado: 'fijo', recurrente_estimado: 'recurrente estimado', expenless: 'real',
};
export function origenTexto(o?: string): string {
  return o ? ORIGEN[o] || o : '';
}

/** Texto completo para lectores de pantalla. */
export function ariaCompromiso(c: Compromiso): string {
  const tj = c.detalle?.tarjetas as Array<{ tarjeta: string; monto_ars: number }> | undefined;
  return [
    `${nombreCompromiso(c)}, ${fmtDia(c.fecha)}: ${fmtExacto(c.monto_ars)}`,
    c.monto_usd > 0 ? `más ${fmtUSD(c.monto_usd)} de la reserva` : '',
    esPagado(c) ? 'pagado' : origenTexto(c.origen),
    tj?.length ? tj.map((t) => `${t.tarjeta} ${fmtExacto(t.monto_ars)}`).join(', ') : '',
  ].filter(Boolean).join('. ');
}

export function detalleCompromiso(c: Compromiso): Array<[string, string]> {
  const x: Array<[string, string]> = [['Fecha de pago', fmtDia(c.fecha)], ['Origen', esPagado(c) ? 'pagado' : origenTexto(c.origen)]];
  if (c.vto_banco && c.vto_banco !== c.fecha) x.push(['Vencimiento del banco', fmtDia(c.vto_banco)]);
  const tj = c.detalle?.tarjetas as Array<{ tarjeta: string; monto_ars: number }> | undefined;
  tj?.forEach((t) => x.push([t.tarjeta, fmtExacto(t.monto_ars)]));
  if (c.detalle?.cuotas_informadas != null) x.push(['Cuotas', fmtExacto(c.detalle.cuotas_informadas)]);
  if (c.detalle?.consumos_informados != null) x.push(['Consumos', fmtExacto(c.detalle.consumos_informados)]);
  if (c.monto_usd > 0) x.push(['De la reserva', fmtUSD(c.monto_usd)]);
  return x;
}

function Proximos7({ items, hoy, irA }: { items: Compromiso[]; hoy?: string; irA: (t: string) => void }) {
  const hasta = hoy ? sumarDias(hoy, 7) : '';
  const prox = items.filter((c) => !hoy || (c.fecha >= hoy && c.fecha <= hasta));
  return (
    <section class="card" aria-label="Próximos 7 días" style="gap:4px">
      <div class="cardhead"><h2>Próximos 7 días</h2><button class="linkbtn" onClick={() => irA('compromisos')}>Ver todos</button></div>
      {prox.length === 0 ? <div class="small">Nada en los próximos 7 días.</div> : (
        <ul class="rows">{prox.map((c) => <FilaCompromiso c={c} />)}</ul>
      )}
    </section>
  );
}

/** Fila mínima: fecha · nombre · monto (✓ si está pagado). */
export function FilaCompromiso({ c, sinNombre }: { c: Compromiso; sinNombre?: boolean }) {
  const nombre = nombreCompromiso(c);
  return (
    <li class="fila1">
      <span class="sr">{ariaCompromiso(c)}</span>
      <span class="num muted" style="flex:none;width:80px" aria-hidden="true">{fmtDia(c.fecha)}</span>
      {!sinNombre && <span class="ell" aria-hidden="true">{nombre}</span>}
      {sinNombre && <span style="flex:1" />}
      {esPagado(c) && <span class="good small" aria-hidden="true" style="display:flex;align-items:center;gap:4px"><Icon n="check" size={16} />{(c as any).etiqueta_estado ?? 'Pagado'}</span>}
      {!esPagado(c) && <span style="display:flex;flex-direction:column;align-items:flex-end">
        <Monto n={c.monto_ars} titulo={`${nombre} · ${fmtDia(c.fecha)}`} cls="monto"
          usd={c.monto_usd > 0 ? `+ ${fmtUSD(c.monto_usd)} de la reserva` : undefined} extra={detalleCompromiso(c)} />
        {c.monto_usd > 0 && <span class="small num" style="margin-top:-12px" aria-hidden="true">+ {fmtUSD(c.monto_usd)}</span>}
      </span>}
    </li>
  );
}
