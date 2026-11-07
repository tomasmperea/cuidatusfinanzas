// Teclado tipo calculadora para cargar montos. Expresión interna: dígitos, ',' decimal y operadores + - * /.

export type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '+' | '-' | '*' | '/' | '=' | 'del';
const OPS = '+-*/';
const esOp = (c: string) => OPS.includes(c);

function numeroActual(expr: string): string {
  const m = expr.match(/[0-9,]*$/);
  return m ? m[0] : '';
}

/** Aplica una tecla a la expresión. */
export function teclear(expr: string, t: Tecla): string {
  const ult = expr.slice(-1);
  const num = numeroActual(expr);
  if (t === 'del') return expr.slice(0, -1);
  if (t === '=') {
    const r = evaluar(expr);
    return r === null ? expr : aTexto(r);
  }
  if (esOp(t)) {
    if (expr === '') return '';
    let e = expr;
    if (e.endsWith(',')) e = e.slice(0, -1);
    if (esOp(e.slice(-1))) e = e.slice(0, -1);
    return e === '' ? '' : e + t;
  }
  if (t === ',') {
    if (num.includes(',')) return expr;
    return expr + (num === '' ? '0,' : ',');
  }
  // dígito
  const [ent, dec] = num.split(',');
  if (dec !== undefined && dec.length >= 2) return expr;
  if (dec === undefined && ent.replace(/^0+/, '').length >= 11) return expr;
  if (num === '0') return expr.slice(0, -1) + t;          // sin ceros a la izquierda
  if (ult === '' && t === '0') return '0';
  return expr + t;
}

/** Resultado de la expresión (× y ÷ antes que + y −). Ignora un operador final. null si no es válida. */
export function evaluar(expr: string): number | null {
  let e = expr;
  while (e && (esOp(e.slice(-1)) || e.endsWith(','))) e = e.slice(0, -1);
  if (!e) return null;
  const partes = e.match(/[0-9]+(?:,[0-9]*)?|[+\-*/]/g);
  if (!partes || partes.join('') !== e) return null;
  const nums: number[] = [];
  const ops: string[] = [];
  for (const p of partes) {
    if (esOp(p)) ops.push(p);
    else nums.push(Number(p.replace(',', '.')));
  }
  if (nums.length !== ops.length + 1 || nums.some((n) => !Number.isFinite(n))) return null;
  // primera pasada: * y /
  const n2: number[] = [nums[0]];
  const o2: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const b = nums[i + 1];
    if (ops[i] === '*') n2[n2.length - 1] *= b;
    else if (ops[i] === '/') { if (b === 0) return null; n2[n2.length - 1] /= b; }
    else { o2.push(ops[i]); n2.push(b); }
  }
  let r = n2[0];
  for (let i = 0; i < o2.length; i++) r = o2[i] === '+' ? r + n2[i + 1] : r - n2[i + 1];
  return Math.round(r * 100) / 100;
}

export function tieneOperacion(expr: string): boolean {
  return /[0-9,][+\-*/]/.test(expr);
}

/** Número → texto de la expresión (2 decimales máx., coma decimal). */
export function aTexto(n: number): string {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '')).replace('.', ',').replace(/^-/, '');
}

const SIM: Record<string, string> = { '+': ' + ', '-': ' − ', '*': ' × ', '/': ' ÷ ' };
/** Expresión para mostrar: 18.540 + 6.460 */
export function mostrar(expr: string): string {
  return expr.replace(/[0-9]+(,[0-9]*)?|[+\-*/]/g, (p) => {
    if (SIM[p]) return SIM[p];
    const [ent, dec] = p.split(',');
    const e = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec === undefined ? e : `${e},${dec}`;
  });
}
