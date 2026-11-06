import { useState } from 'preact/hooks';
import { api, type Compromiso } from '../api';
import { fmtAbrev, fmtDDMM, fmtDia, fmtExacto, fmtUSD } from '../format';
import { Icon, Load, Monto, OrigenChip, useAsync } from '../ui';
import { detalleCompromiso, extrasCompromiso, FilaCompromiso, nombreCompromiso } from './Inicio';

export function Compromisos() {
  const comp = useAsync(() => api.compromisos(), []);
  const dash = useAsync(() => api.dashboard(), []);
  const [modo, setModo] = useState<'tarjeta' | 'fecha'>('tarjeta');
  return (
    <>
      <Load a={dash} que="el total de compromisos" h={140}>{(d) => {
        const c = d.compromisos_90d; const o = c.por_origen || {};
        const seg = [
          ['Confirmados', o.resumen_confirmado || 0, 'var(--accent-strong)'],
          ['TC estimadas', o.estimado || 0, 'var(--accent-mid)'],
          ['Alquiler (fijo)', o.fijo_estimado || 0, 'var(--neutral-bar)'],
        ] as const;
        return (
          <section class="card" aria-label="Total 90 días">
            <div class="cardhead">
              <div class="eyebrow">Total 90 días</div>
              <Monto n={c.total_ars} titulo="Compromisos de los próximos 90 días" cls="disp" usd={c.total_usd ? `+ ${fmtUSD(c.total_usd)} de la reserva` : undefined}
                extra={seg.map(([k, v]) => [k, fmtExacto(v)] as [string, string])} />
            </div>
            {c.total_usd > 0 && <div class="small num" style="margin-top:-8px;text-align:right">+ {fmtUSD(c.total_usd)} de la reserva{d.reserva_usd ? ` · te quedan ${fmtUSD(d.reserva_usd.libre)}` : ''}</div>}
            <div class="stack" role="img" aria-label="Composición del total">
              {seg.filter(([, v]) => v > 0).map(([, v, col]) => <span style={{ flex: `${v} 1 0`, background: col }} />)}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              {seg.map(([k, v, col]) => (
                <div style="display:flex;align-items:center;gap:8px;font-size:12.5px">
                  <span class="sw" style={{ background: col }} /><span class="muted">{k}</span>
                  <span class="num" style="margin-left:auto;font-weight:600">{fmtAbrev(v)}</span>
                </div>
              ))}
            </div>
          </section>
        );
      }}</Load>
      <div class="pad">
        <div class="seg" role="group" aria-label="Agrupar">
          <button aria-pressed={modo === 'tarjeta'} onClick={() => setModo('tarjeta')}>{modo === 'tarjeta' && <Icon n="check" size={15} />}Por tarjeta</button>
          <button aria-pressed={modo === 'fecha'} onClick={() => setModo('fecha')}>{modo === 'fecha' && <Icon n="check" size={15} />}Por fecha</button>
        </div>
      </div>
      <Load a={comp} que="los compromisos" h={400}>
        {(c) => c.length === 0 ? <section class="card"><div class="small">No hay compromisos en los próximos 90 días.</div></section>
          : modo === 'fecha' ? (
            <section class="card" aria-label="Compromisos por fecha"><ul class="rows">{c.map((x) => <FilaCompromiso c={x} conCuotas />)}</ul></section>
          ) : agrupar(c).map(([nombre, items]) => <TarjetaCard nombre={nombre} items={items} />)}
      </Load>
    </>
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

function subtitulo(items: Compromiso[]): string {
  const p = items[0];
  const tj = p.detalle?.tarjetas as Array<{ tarjeta: string }> | undefined;
  if (tj?.length) return tj.map((t) => t.tarjeta).join(' + ');
  if (p.tipo === 'fijo') return 'Último pagado · ajusta por ICL';
  return `Vence el banco el ${p.vto_banco ? fmtDDMM(p.vto_banco) : '—'}`;
}

function TarjetaCard({ nombre, items }: { nombre: string; items: Compromiso[] }) {
  const [p, ...resto] = items;
  return (
    <article class="card" style="padding:12px 14px 4px;gap:6px" aria-label={nombre}>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="width:36px;height:36px;border-radius:10px;background:var(--chip);display:flex;align-items:center;justify-content:center;flex:none">
          <Icon n={p.tipo === 'fijo' ? 'casa' : 'card'} />
        </span>
        <div style="display:flex;flex-direction:column;min-width:0"><h3>{nombre}</h3><span class="small num">{subtitulo(items)}</span></div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:56px">
        <span style="display:flex;flex-direction:column;gap:4px">
          <span class="num" style="font-size:13px;font-weight:650">{fmtDia(p.fecha)}</span>
          <span><OrigenChip origen={p.origen} estado={p.estado_ciclo} base={p.base} /></span>
        </span>
        <Monto n={p.monto_ars} titulo={`${nombre} · ${fmtDia(p.fecha)}`} cls="disp" extra={detalleCompromiso(p)} />
      </div>
      {extrasCompromiso(p, true).map((e) => (
        <div class="small num" style="display:flex;gap:6px;align-items:center">{e.includes('USD') && <Icon n="usd" size={15} />}{e}</div>
      ))}
      {resto.length > 0 && (
        <ul class="rows" style="margin-top:4px;border-top:1px solid var(--line)">
          {resto.map((x) => (
            <li style="display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:48px">
              <span class="num small">{fmtDia(x.fecha)}</span>
              <span><OrigenChip origen={x.origen} estado={x.estado_ciclo} base={x.base} /></span>
              <Monto n={x.monto_ars} titulo={`${nombre} · ${fmtDia(x.fecha)}`} cls="" extra={detalleCompromiso(x)} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
