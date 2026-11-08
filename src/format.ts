// Formateo de montos y fechas (es-AR). Solo presentación: no calcula finanzas.

export const TZ = 'America/Argentina/Buenos_Aires';
const NBSP = ' ';
const MINUS = '−';

const nf = (dec: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: true });
const nf0 = nf(0);
const nf2 = nf(2);

function signo(n: number): string {
  return n < 0 ? MINUS : '';
}

/** Monto abreviado con 2 decimales: $3,22 M · $149,02 k · −$950. */
export function fmtAbrev(n: number | null | undefined, opts: { signoMas?: boolean; sinPeso?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const pre = (n < 0 ? MINUS : opts.signoMas && n > 0 ? '+' : '') + (opts.sinPeso ? '' : '$');
  // Se redondea a centésimos de la unidad para decidir el salto k → M (999.999 → $1,00 M).
  const enK = Math.round(abs / 10) / 100;
  if (enK >= 1000) return `${pre}${nf2.format(Math.round(abs / 1e4) / 100)}${NBSP}M`;
  if (Math.round(abs * 100) / 100 >= 1000) return `${pre}${nf2.format(Math.round(abs / 10) / 100)}${NBSP}k`;
  return `${pre}${Number.isInteger(abs) ? nf0.format(abs) : nf2.format(abs)}`;
}

/** Versión compacta para el calendario: 3,26M · 86,11k · −10,41k (sin $). */
export function fmtCompacto(n: number | null | undefined): string {
  return fmtAbrev(n, { sinPeso: true }).replace(NBSP, '');
}

/** Monto exacto: $3.223.496 · −$149.018,69. */
export function fmtExacto(n: number | null | undefined, opts: { signoMas?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const s = Number.isInteger(Math.round(abs * 100) / 100) ? nf0.format(abs) : nf2.format(abs);
  return `${n < 0 ? MINUS : opts.signoMas && n > 0 ? '+' : ''}$${s}`;
}

/** Monto redondeado a pesos: −$149.019. */
export function fmtEntero(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const r = Math.round(n);
  return `${signo(r)}$${nf0.format(Math.abs(r))}`;
}

export function fmtUSD(n: number): string {
  return `USD${NBSP}${nf2.format(n)}`;
}

/** Porcentaje con 2 decimales como máximo: −48,36% · +7,9%. */
export function fmtPct(n: number | null | undefined, opts: { signoMas?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${n < 0 ? MINUS : opts.signoMas && n > 0 ? '+' : ''}${s}%`;
}

// ---------- Fechas ----------
// Las fechas de los RPC vienen como 'YYYY-MM-DD' (día AR). Se tratan como fechas de calendario, sin huso.
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function partes(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}
const p2 = (n: number) => String(n).padStart(2, '0');

export function diaSemana(iso: string): number {
  const [y, m, d] = partes(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** 10/11 */
export function fmtDDMM(iso: string): string {
  const [, m, d] = partes(iso);
  return `${p2(d)}/${p2(m)}`;
}
/** mar 10/11 */
export function fmtDia(iso: string): string {
  return `${DIAS[diaSemana(iso)]} ${fmtDDMM(iso)}`;
}
/** Mar 10/11 */
export function fmtDiaCap(iso: string): string {
  const s = fmtDia(iso);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Noviembre 2026 */
export function fmtMes(iso: string): string {
  const [y, m] = partes(iso);
  const s = MESES[m - 1];
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${y}`;
}
export function nombreMes(iso: string): string {
  return MESES[partes(iso)[1] - 1];
}
/** Suma días a una fecha ISO (para filtrar ventanas de presentación). */
export function sumarDias(iso: string, n: number): string {
  const [y, m, d] = partes(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}

/**
 * "dd/mm hh:mm" de un timestamp. Si trae huso (Z o ±hh:mm) se pasa a hora AR;
 * si no trae (hora local), se muestra tal cual.
 */
export function fmtFechaHora(ts: string | null | undefined): string {
  if (!ts) return '—';
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) {
    const f = new Intl.DateTimeFormat('es-AR', {
      timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(ts));
    const g = (t: string) => f.find((x) => x.type === t)?.value ?? '';
    return `${p2(Number(g('day')))}/${p2(Number(g('month')))} ${p2(Number(g('hour')) % 24)}:${g('minute')}`;
  }
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
  return fmtDDMM(ts);
}

/** Hoy en AR como 'YYYY-MM-DD' (solo para la UI; los RPC traen su propio "hoy"). */
export function hoyAR(now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(now);
}

/**
 * Normaliza textos que arma el servidor: "-$" → "−$" y "$25 mil" → "$25 k".
 * (El servidor redondea esos montos; acá no se inventan decimales.)
 */
export function normalizarTexto(t: string): string {
  return t
    .replace(/(^|[\s(:])-(\$|\d)/g, '$1\u2212$2')
    .replace(/\$(\d+(?:[.,]\d+)?)\s?mil\b/g, '$$$1\u00A0k')
    .replace(/\$(\d+(?:,\d+)?)\s?M\b/g, '$$$1\u00A0M');
}
