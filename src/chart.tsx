import { useState } from 'preact/hooks';
import type { Escenario, ForecastDia } from './api';
import { fmtAbrev, fmtDia, fmtDDMM, fmtEntero, fmtExacto, nombreMes } from './format';

const W = 356, H = 190, L = 44, R = 8, T = 12, B = 24;
const NOMBRE: Record<Escenario, string> = { central: 'Central', conservador: 'Conservador', optimista: 'Optimista' };

export function Curva90({ esc, sel, con, opt, piso, minimo }: {
  esc: Escenario; sel: ForecastDia[]; con?: ForecastDia[]; opt?: ForecastDia[]; piso: number;
  minimo: { fecha: string; saldo: number };
}) {
  const [i, setI] = useState<number | null>(null);
  const todos = [...sel, ...(con || []), ...(opt || [])].map((d) => d.saldo_fin);
  let lo = Math.min(0, ...todos), hi = Math.max(piso, ...todos);
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const n = sel.length;
  const x = (k: number) => L + (k * (W - L - R)) / Math.max(1, n - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const linea = (s: ForecastDia[]) => s.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(d.saldo_fin).toFixed(1)}`).join('');
  const banda = con && opt && con.length === n && opt.length === n
    ? linea(opt) + con.map((_, k) => `L${x(n - 1 - k).toFixed(1)},${y(con[n - 1 - k].saldo_fin).toFixed(1)}`).join('') + 'Z'
    : null;
  // ticks Y: 4 valores redondos
  const paso = niceStep((hi - lo) / 4);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / paso) * paso; v <= hi; v += paso) ticks.push(v);
  // marcas de mes
  const meses = sel.map((d, k) => [d.fecha, k] as const).filter(([f], k) => k > 0 && f.endsWith('-01'));
  const kMin = Math.max(0, sel.findIndex((d) => d.fecha === minimo.fecha));
  const label = `Curva de liquidez a 90 días, escenario ${NOMBRE[esc].toLowerCase()}. Valle de ${fmtEntero(minimo.saldo)} el ${fmtDDMM(minimo.fecha)}. ` +
    `Piso de ${fmtEntero(piso)}.${banda ? ' De fondo, la banda entre conservador y optimista.' : ''}`;

  const elegir = (ev: PointerEvent) => {
    const svg = ev.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    setI(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  };
  const d = i !== null ? sel[i] : null;
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerDown={elegir as any}
        onPointerMove={((e: PointerEvent) => e.buttons && elegir(e)) as any} data-testid="curva">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--warn-mark)" stroke-width="1.2" />
          </pattern>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={L - 6} y={y(v) + 3.5} text-anchor="end" font-size="10" fill="var(--muted)">{fmtAbrev(v, { sinPeso: true }).replace(' ', '')}</text>
          </g>
        ))}
        {meses.map(([f, k]) => (
          <g key={f}>
            <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} stroke="var(--grid)" />
            <text x={x(k) + 3} y={H - 8} font-size="10" fill="var(--muted)">{nombreMes(f).slice(0, 3)}</text>
          </g>
        ))}
        <text x={L} y={H - 8} font-size="10" fill="var(--muted)">hoy</text>
        {/* zona bajo cero, rayada */}
        <rect x={L} y={y(0)} width={W - L - R} height={Math.max(0, H - B - y(0))} fill="url(#hatch)" opacity="0.35" />
        {banda && <path d={banda} fill="var(--band)" opacity="0.9" />}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" stroke-width="1.2" />
        <line x1={L} x2={W - R} y1={y(piso)} y2={y(piso)} stroke="var(--warn-mark)" stroke-width="1.5" stroke-dasharray="5 4" />
        <text x={W - R} y={y(piso) - 4} text-anchor="end" font-size="10" font-weight="600" fill="var(--warn)">Piso {fmtAbrev(piso)}</text>
        <path d={linea(sel)} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
        <circle cx={x(kMin)} cy={y(minimo.saldo)} r="4.5" fill="var(--card)" stroke="var(--warn)" stroke-width="2.5" />
        <text x={Math.min(Math.max(x(kMin), L + 30), W - 40)} y={Math.min(y(minimo.saldo) + 16, H - B - 2)} text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--warn)">
          {fmtAbrev(minimo.saldo)}
        </text>
        {d && i !== null && (
          <g>
            <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="var(--fg)" stroke-width="1" />
            <circle cx={x(i)} cy={y(d.saldo_fin)} r="4.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2" />
          </g>
        )}
      </svg>
      <div class="legend" aria-hidden="true">
        {banda && <span><span class="sw" style="background:var(--band)" />Rango conservador–optimista</span>}
        <span><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--accent)" stroke-width="2.5" /></svg>{NOMBRE[esc]}</span>
        <span><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--warn-mark)" stroke-width="1.5" stroke-dasharray="5 4" /></svg>Piso</span>
        <span><svg width="12" height="12"><rect width="12" height="12" rx="3" fill="url(#hatch)" stroke="var(--warn-line)" /></svg>Bajo cero</span>
      </div>
      {d && (
        <div class="tip num" aria-live="polite" data-testid="tip">
          <div><b>{fmtDia(d.fecha)}</b> · saldo al cierre {fmtExacto(d.saldo_fin)}{d.saldo_fin < piso ? ' · bajo el piso' : ''}</div>
          {d.eventos?.filter((e) => e.tipo !== 'sin_backup').map((e) => (
            <div class="small">{e.concepto}: {fmtExacto((e.tipo === 'sueldo' || e.tipo === 'aguinaldo' ? 1 : -1) * Math.abs(e.monto), { signoMas: true })}{e.monto_usd ? ` + USD ${e.monto_usd.toLocaleString('es-AR')}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
