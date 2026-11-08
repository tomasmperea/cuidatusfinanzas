// Acceso a datos: todo número sale de los RPC de Supabase. La app no calcula finanzas.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ikbmkscrtecijwmyuaqb.supabase.co';
// Key publishable (pública por diseño). Los datos los protegen login + MFA + RLS/RPC con chequeo de dueño.
export const SUPABASE_KEY = 'sb_publishable_afLlaBSG4PD1mKdIh8ZcQw_VPjSolYH';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ctf-auth' },
});

export type Escenario = 'central' | 'conservador' | 'optimista';
export const ESCENARIOS: Escenario[] = ['conservador', 'central', 'optimista'];

type RpcFn = (name: string, args: Record<string, unknown>) => Promise<unknown>;

// Avisos a la app cuando la sesión deja de servir (para volver a evaluar login / MFA).
const oyentes = new Set<() => void>();
export function onSesionInvalida(f: () => void) { oyentes.add(f); return () => oyentes.delete(f); }
const avisar = () => oyentes.forEach((f) => f());

export class SesionError extends Error {}

function esErrorDeSesion(e: { code?: string; message?: string; status?: number } | null): boolean {
  if (!e) return false;
  return e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt|token/i.test(e.message || '');
}

/** Sin aal2 no se llama a ningún RPC de datos. */
async function exigirAal2() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data.currentLevel !== 'aal2') { avisar(); throw new SesionError('Falta el segundo factor'); }
}

let rpcImpl: RpcFn = async (name, args) => {
  await exigirAal2();
  let r = await supabase.rpc(name, args);
  if (r.error && esErrorDeSesion({ ...r.error, status: r.status })) {
    // Un solo intento de refrescar la sesión; si falla, se cierra y vuelve al login.
    const { error } = await supabase.auth.refreshSession();
    if (error) { await supabase.auth.signOut({ scope: 'local' }); avisar(); throw new SesionError('Sesión vencida'); }
    await exigirAal2();
    r = await supabase.rpc(name, args);
    if (r.error && esErrorDeSesion({ ...r.error, status: r.status })) { await supabase.auth.signOut({ scope: 'local' }); avisar(); throw new SesionError('Sesión vencida'); }
  }
  if (r.error) throw new Error(r.error.message || 'Error del servidor');
  return r.data;
};

/** Solo para `vite dev` con fixtures (ver main.tsx). */
export function setRpcImpl(fn: RpcFn) {
  rpcImpl = fn;
}

const cache = new Map<string, Promise<unknown>>();

export function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const key = name + JSON.stringify(args);
  let p = cache.get(key);
  if (!p) {
    p = rpcImpl(name, args);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p as Promise<T>;
}

export function limpiarCache() {
  cache.clear();
}

// ---------- Tipos (subset de los contratos de fase3 §4.1 y fase5) ----------
export interface Backup {
  archivo?: string; ultimo_movimiento?: string | null; dias?: number | null; estado?: string; procesado_en?: string;
}
export interface Kpis {
  hoy: string; escenario: Escenario; liquidez_hoy: number;
  burn_rate: { diario: number; mensual: number; regla?: string };
  saldo_neto_30d: {
    fecha: string; saldo: number; variacion_pct?: number | null; variacion_monto?: number | null;
    tendencia?: { direccion: string; simbolo: string | null; delta: number | null; ayer: number | null };
  };
  minimo_90d: { fecha: string; saldo: number };
  piso: { umbral: number; primer_dia_bajo_piso: string | null; dias_bajo_piso: number; primer_dia_bajo_cero: string | null; dias_bajo_cero: number };
  backup: Backup;
}
export interface ForecastDia {
  fecha: string; saldo_inicio: number; ingresos: number; egresos_compromisos: number; egresos_variables: number;
  saldo_fin: number; alerta: string; eventos: Array<{ tipo: string; concepto: string; monto: number; monto_usd?: number; origen?: string }>;
}
export interface EventoDia {
  tipo: string; concepto: string; tarjeta?: string | null; monto: number; monto_usd?: number; signo: number;
  fuente?: string; origen?: string; estado_ciclo?: string;
}
export interface CalDia {
  fecha: string; dia_semana: number; tipo: 'real' | 'sin_backup' | 'proyectado'; saldo_cierre: number;
  ingresos: number; egresos: number; bajo_piso: boolean; bajo_cero: boolean; eventos: EventoDia[];
}
export interface Calendario {
  mes: string; hoy: string; escenario: Escenario; piso: number; datos_backup_hasta: string | null;
  resumen: { minimo: number; fecha_minimo: string; primer_dia_bajo_piso: string | null; dias_bajo_piso: number; dias_bajo_cero: number; cierre_mes: number };
  dias: CalDia[];
}
export interface Compromiso {
  fecha: string; tipo: 'tc' | 'fijo'; tarjeta: string | null; concepto: string; monto_ars: number; monto_usd: number;
  origen: 'resumen_confirmado' | 'estimado' | 'fijo_estimado' | string; base: string; estado_ciclo: string; vto_banco: string | null;
  detalle: Record<string, any>;
}
export interface Bloque {
  ingresos_recurrentes: { sueldo: number; aguinaldo: number; total: number };
  egresos_fijos: { vivienda: number; servicios: number; prestamos: number; tarjetas: number; tarjetas_usd: number; total: number };
  gasto_variable: number; liquidez_libre: number; otros_ingresos: number; liquidez_libre_con_otros_ingresos: number;
}
export interface IngresosEgresos {
  mes: string; hoy: string; escenario?: string; estado_mes: string; real_hasta: string; datos_backup_hasta: string | null;
  real: Bloque; proyectado: Bloque; total: Bloque;
  detalle: Array<{ fecha: string; grupo: string; concepto: string; monto: number; fuente: string; origen: string }>;
}
export interface LiquidezComprometida {
  mes: string; hoy: string; ingreso_mensual: number; disponible_libre: number;
  grupos: Array<{ grupo: string; nombre: string; monto: number; pct_ingreso: number; nota?: string }>;
  tarjeta_total: { monto: number; cuotas: number; resto: number; usd: number };
  cuotas_futuras?: { monto: number; compras: number; hasta: string };
  proximo_cobro?: { fecha: string; tipo: string; concepto: string; monto: number } | null;
}
export interface Snapshot {
  hoy: string; semana: { desde: string; hasta: string }; datos_backup_hasta: string | null;
  gasto_semana: number; promedio_semanal: number; desvio_neto: number; desvio_neto_pct: number;
  desvios: Array<{ categoria: string; real: number; promedio: number; desvio: number; desvio_pct: number; lado: string }>;
  desvios_descartados?: number;
  compromisos_7d: { total: number; items: Array<{ fecha: string; tipo: string; concepto: string; tarjeta: string | null; monto_ars: number; monto_usd: number; origen: string }> };
  proximo_valle: { fecha: string; saldo: number } | null;
  primer_dia_bajo_piso: { fecha: string; piso: number; dias: number; minimo: number } | null;
  liquidez_hoy: number; texto: string;
  dias?: number; en_curso?: boolean; es_actual?: boolean; lunes?: string; domingo?: string; hay_anterior?: boolean;
}
export interface Ajustes {
  estado: 'ok' | 'sin_disparo' | 'desactualizado' | 'sin_corrida' | string; fecha_corrida?: string;
  disparo?: { activo: boolean; motivo: string };
  base?: { minimo: number; fecha_minimo: string; dias_bajo_piso: number; piso: number };
  ajustes?: Array<{ id: number; rank: number; titulo: string; texto: string; impacto?: { delta_minimo?: number; minimo_nuevo: number; dias_bajo_piso_nuevo: number } }>;
}
export interface Dashboard {
  compromisos_90d: { total_ars: number; total_usd: number; por_origen: Record<string, number> };
  reserva_usd?: { saldo: number; comprometido_tc_90d: number; libre: number };
}

// ---------- Caja (registro de movimientos) ----------
export type Flujo = 'gasto' | 'ingreso' | 'transferencia';
export interface Subcat { id: number; nombre: string; grupo: string; flujo: Flujo; uso?: number }
export interface CuentaCaja { id: number; nombre: string; moneda: 'ARS' | 'USD'; saldo: number | null }
export interface MovCaja {
  id: number; fecha: string; ts: string; monto: number; signo: number; moneda: string; cuenta_id: number;
  subcat_id: number | null; editable: boolean; nota: string | null; titulo: string; grupo: string;
  contra_cuenta_id: number | null; contra_monto: number | null;
}
export interface Pendiente {
  id: number; fecha: string; ts: string | null; monto: number; signo: number; descripcion: string | null;
  sugerencia: { tipo: Flujo; subcat_id?: number; nota?: string; destino_id?: number };
}
export interface Caja {
  hoy: string; desde: string | null; activo: boolean;
  liquidez: { saldo: number; var_mes: number };
  cuentas: CuentaCaja[]; subcategorias: Subcat[]; atajos: Array<{ id: number; nombre: string; grupo: string }>;
  tarjetas: string[]; movimientos: MovCaja[]; pendientes: Pendiente[];
}
export interface MovInput {
  id?: number; tipo: Flujo; monto: number; cuenta_id: number; subcat_id?: number | null; destino_id?: number | null;
  monto_destino?: number | null; fecha?: string; nota?: string | null; evid_id?: number | null;
}
type Guardado = { ok: boolean; id: number; liquidez: number };

/** Escrituras: nunca pasan por la caché y la vacían (todo lo demás se recalcula). */
async function escribir<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = (await rpcImpl(name, args)) as T;
  limpiarCache();
  return r;
}

export const api = {
  caja: (cuenta: number) => rpcImpl('rpc_caja', { p_cuenta: cuenta }) as Promise<Caja>,
  guardarMov: (m: MovInput) => escribir<Guardado>('rpc_mov_guardar', { p: m }),
  borrarMov: (id: number, deshacer = false) => escribir<Guardado>('rpc_mov_borrar', { p_id: id, p_deshacer: deshacer }),
  descartarPendiente: (id: number, deshacer = false) => escribir<{ ok: boolean }>('rpc_pendiente_descartar', { p_evid_id: id, p_deshacer: deshacer }),
  kpis: (e: Escenario) => rpc<Kpis>('rpc_kpis', { p_escenario: e }),
  forecast: (e: Escenario) => rpc<ForecastDia[]>('rpc_forecast', { p_escenario: e, p_horizonte: 90 }),
  calendario: (e: Escenario) => rpc<Calendario>('rpc_calendario_mes', { p_mes: null, p_escenario: e }),
  ingresosEgresos: () => rpc<IngresosEgresos>('rpc_ingresos_egresos_mes', { p_mes: null }),
  liquidezComprometida: () => rpc<LiquidezComprometida>('rpc_liquidez_comprometida', { p_mes: null }),
  compromisos: () => rpc<Compromiso[]>('rpc_compromisos', { p_dias: 90 }),
  snapshot: (fecha: string | null = null) => rpc<Snapshot>('rpc_semana', { p_fecha: fecha }),
  ajustes: () => rpc<Ajustes>('rpc_ajustes'),
  dashboard: () => rpc<Dashboard>('rpc_dashboard'),
};
