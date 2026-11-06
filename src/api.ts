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

let rpcImpl: RpcFn = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'Error del servidor');
  return data;
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
}
export interface Ajustes {
  estado: 'ok' | 'sin_disparo' | 'desactualizado' | 'sin_corrida' | string; fecha_corrida?: string;
  disparo?: { activo: boolean; motivo: string };
  ajustes?: Array<{ id: number; rank: number; titulo: string; texto: string; impacto?: { minimo_nuevo: number; dias_bajo_piso_nuevo: number } }>;
}
export interface Dashboard {
  compromisos_90d: { total_ars: number; total_usd: number; por_origen: Record<string, number> };
  reserva_usd?: { saldo: number; comprometido_tc_90d: number; libre: number };
}

export const api = {
  kpis: (e: Escenario) => rpc<Kpis>('rpc_kpis', { p_escenario: e }),
  forecast: (e: Escenario) => rpc<ForecastDia[]>('rpc_forecast', { p_escenario: e, p_horizonte: 90 }),
  calendario: (e: Escenario) => rpc<Calendario>('rpc_calendario_mes', { p_mes: null, p_escenario: e }),
  ingresosEgresos: () => rpc<IngresosEgresos>('rpc_ingresos_egresos_mes', { p_mes: null }),
  liquidezComprometida: () => rpc<LiquidezComprometida>('rpc_liquidez_comprometida', { p_mes: null }),
  compromisos: () => rpc<Compromiso[]>('rpc_compromisos', { p_dias: 90 }),
  snapshot: () => rpc<Snapshot>('rpc_snapshot_semanal', { p_hasta: null }),
  ajustes: () => rpc<Ajustes>('rpc_ajustes'),
  dashboard: () => rpc<Dashboard>('rpc_dashboard'),
};
