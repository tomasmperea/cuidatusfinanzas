import { api, type Compromiso } from '../api';
import { fmtAbrev, fmtDia, fmtUSD, sumarDias } from '../format';
import { Icon, Load, Monto, useAsync } from '../ui';
import { FilaCompromiso, esPagado, nombreCompromiso } from './Inicio';

const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export function Compromisos() {
  const comp = useAsync(() => api.compromisos(), []);
  return (
    <Load a={comp} que="los compromisos" h={400}>
      {(c) => c.length === 0
        ? <section class="card"><div class="small">No hay compromisos en los próximos 90 días.</div></section>
        : <>
          <Resumen30 c={c} />
          {agrupar(c).map(([nombre, items]) => {
            const pend = items.filter((x) => !esPagado(x));
            const tot = pend.reduce((a, x) => a + x.monto_ars, 0);
            const usd = pend.reduce((a, x) => a + (x.monto_usd || 0), 0);
            return (
              <section class="card" aria-label={nombre} style="gap:2px;padding:14px 16px 4px">
                <div class="cardhead">
                  <h2 style="display:flex;align-items:center;gap:8px">
                    <Icon n={items[0].tipo === 'fijo' ? 'casa' : 'card'} size={18} />{nombre}
                  </h2>
                  <span class="tot"><Monto n={tot} titulo={`${nombre} · pendiente en 90 días`} cls="num"
                    usd={usd > 0 ? `+ ${fmtUSD(usd)} de la reserva` : undefined} /></span>
                </div>
                <ul class="rows">{items.map((x) => <FilaCompromiso c={x} sinNombre />)}</ul>
              </section>
            );
          })}
        </>}
    </Load>
  );
}

/** Lo que importa: cuánto hay que pagar en los próximos 30 días y cuál es el próximo pago. */
function Resumen30({ c }: { c: Compromiso[] }) {
  const hoy = hoyAR();
  const hasta = sumarDias(hoy, 30);
  const pend = c.filter((x) => !esPagado(x) && x.fecha >= hoy && x.fecha <= hasta && (x.monto_ars > 0 || x.monto_usd > 0));
  const tot = pend.reduce((a, x) => a + x.monto_ars, 0);
  const usd = pend.reduce((a, x) => a + (x.monto_usd || 0), 0);
  const prox = [...pend].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  return (
    <section class="hero-card durazno" aria-label="A pagar en los próximos 30 días" data-testid="comp-30">
      <div class="eyebrow">A pagar en los próximos 30 días</div>
      <div class="hero-num">
        <Monto n={tot} titulo="A pagar en 30 días" cls="num" usd={usd > 0 ? `+ ${fmtUSD(usd)} de la reserva` : undefined}
          extra={[['Pagos', String(pend.length)]]} />
      </div>
      <div class="chips">
        <span>{pend.length} {pend.length === 1 ? 'pago' : 'pagos'}</span>
        {usd > 0 && <span class="num">+ {fmtUSD(usd)}</span>}
        {prox && <span class="num">Próximo: {nombreCompromiso(prox)} · {fmtDia(prox.fecha)} · {fmtAbrev(prox.monto_ars)}</span>}
      </div>
    </section>
  );
}

function agrupar(c: Compromiso[]): Array<[string, Compromiso[]]> {
  const m = new Map<string, Compromiso[]>();
  for (const x of c) {
    const k = nombreCompromiso(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return [...m.entries()];
}
