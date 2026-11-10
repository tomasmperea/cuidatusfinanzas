// SOLO DESARROLLO. Se importa dentro de `if (import.meta.env.DEV)`, así que no entra en el build.
// Los JSON se sirven desde ../fixtures (fuera del repo) con el plugin `fixtures` de vite.config.ts.
import { setAsistenteImpl, setRpcImpl, type TurnoIA } from './api';

const ARCHIVO: Record<string, string> = {
  rpc_kpis: 'kpis', rpc_forecast: 'forecast', rpc_calendario_mes: 'calendario',
  rpc_ingresos_egresos_mes: 'ingresos_egresos', rpc_liquidez_comprometida: 'liquidez_comprometida',
  rpc_compromisos: 'compromisos', rpc_snapshot_semanal: 'snapshot', rpc_ajustes: 'ajustes', rpc_dashboard: 'dashboard',
  rpc_caja: 'caja',
  rpc_semana: 'snapshot',
};

export function activarFixtures(params: URLSearchParams) {
  const fallan = (params.get('error') || '').split(',').filter(Boolean);
  const backupDias = params.get('backup_dias');
  setRpcImpl(async (name, args) => {
    await new Promise((r) => setTimeout(r, 60));
    if (fallan.includes('all') || fallan.includes(name)) throw new Error('Fallo simulado (modo desarrollo)');
    if (name.startsWith('rpc_mov_') || name === 'rpc_pendiente_descartar') return simularEscritura(name, args);
    if (name === 'rpc_ia_marcar') return { ok: true };
    if (name === 'rpc_ia_conversaciones') return [
      { id: '11111111-1111-4111-8111-111111111111', ultimo: '2026-11-08T20:00:00Z', inicio: '2026-11-08T19:58:00Z', mensajes: 4,
        pregunta: 'Quiero cambiar la moto en 12 cuotas', titulo: 'Moto en 12 cuotas', veredicto: 'ajustado', guardado: true },
      { id: '22222222-2222-4222-8222-222222222222', ultimo: '2026-11-07T15:00:00Z', inicio: '2026-11-07T14:59:00Z', mensajes: 2,
        pregunta: '¿Dónde puedo recortar?', titulo: null, veredicto: null, guardado: false },
    ];
    if (name === 'rpc_ia_conversacion') return [
      { id: 1, rol: 'usuario', contenido: { texto: '¿Dónde puedo recortar?' }, guardado: false },
      { id: 2, rol: 'asistente', contenido: { tipo: 'respuesta', texto: 'Lo más recortable son las salidas y el delivery (texto de ejemplo).' }, guardado: false },
    ];
    if (name === 'rpc_caja' && caja) return JSON.parse(JSON.stringify(caja));
    if (name.startsWith('rpc_meta') || name.startsWith('rpc_alerta') || name.startsWith('rpc_push_')) return simularMetasAvisos(name, args, params);
    const res = await fetch(`/__fixtures/${ARCHIVO[name]}.json`);
    if (!res.ok) throw new Error(`Sin fixture para ${name}`);
    let data = await res.json();
    const esc = args.p_escenario as string | undefined;
    if (esc && data && !Array.isArray(data) && data[esc]) data = data[esc];
    if (name === 'rpc_caja') { caja = data; return JSON.parse(JSON.stringify(caja)); }
    if (name === 'rpc_semana') return { ...data, es_actual: !args?.p_fecha, en_curso: false, dias: 7, hay_anterior: true };
    if (name === 'rpc_kpis' && backupDias) data = { ...data, backup: { ...data.backup, dias: Number(backupDias), estado: 'viejo' } };
    return data;
  });
}

// ---- Escrituras simuladas en memoria (solo para probar la pantalla Caja en desarrollo) ----
let caja: any = null;
let sec = 900000;
const borrados = new Map<number, any>();
function simularEscritura(name: string, a: any) {
  if (!caja) throw new Error('Abrí Caja primero');
  const cta = (id: number) => caja.cuentas.find((c: any) => c.id === id);
  const mover = (m: any, k: number) => {
    const c = cta(m.cuenta_id); c.saldo += k * m.signo * m.monto;
    if (m.cuenta_id !== 2) { caja.liquidez.saldo += k * m.signo * m.monto; caja.liquidez.var_mes += k * m.signo * m.monto; }
  };
  if (name === 'rpc_mov_guardar') {
    const p = a.p;
    if (p.id) { const v = caja.movimientos.find((m: any) => m.id === p.id); if (v) { mover(v, -1); caja.movimientos = caja.movimientos.filter((m: any) => m !== v); } }
    const sub = caja.subcategorias.find((s: any) => s.id === p.subcat_id) || { nombre: 'Transferencia', grupo: 'Transferencia' };
    const m = { id: ++sec, ts: p.fecha + 'T19:12:00', fecha: p.fecha, monto: p.monto, signo: p.tipo === 'ingreso' ? 1 : -1, moneda: cta(p.cuenta_id).moneda,
      cuenta_id: p.cuenta_id, subcat_id: p.tipo === 'transferencia' ? 1 : p.subcat_id, editable: true, nota: p.nota,
      titulo: p.tipo === 'transferencia' ? 'A ' + cta(p.destino_id).nombre : sub.nombre, grupo: sub.grupo,
      contra_cuenta_id: p.destino_id ?? null, contra_monto: p.monto_destino ?? null };
    mover(m, 1);
    if (p.tipo === 'transferencia') { const d = cta(p.destino_id); d.saldo += p.monto_destino; if (p.destino_id !== 2) { caja.liquidez.saldo += p.monto_destino; caja.liquidez.var_mes += p.monto_destino; } }
    caja.movimientos.unshift(m);
    if (p.evid_id) caja.pendientes = caja.pendientes.filter((x: any) => x.id !== p.evid_id);
    return { ok: true, id: m.id, liquidez: caja.liquidez.saldo };
  }
  if (name === 'rpc_mov_borrar') {
    if (a.p_deshacer) { const m = borrados.get(a.p_id); if (m) { mover(m, 1); caja.movimientos.unshift(m); } return { ok: true }; }
    const m = caja.movimientos.find((x: any) => x.id === a.p_id);
    if (m) { mover(m, -1); borrados.set(m.id, m); caja.movimientos = caja.movimientos.filter((x: any) => x !== m); }
    return { ok: true };
  }
  if (name === 'rpc_pendiente_descartar') {
    if (!a.p_deshacer) { borrados.set(-a.p_evid_id, caja.pendientes.find((x: any) => x.id === a.p_evid_id)); caja.pendientes = caja.pendientes.filter((x: any) => x.id !== a.p_evid_id); }
    else { const x = borrados.get(-a.p_evid_id); if (x) caja.pendientes.unshift(x); }
    return { ok: true };
  }
  return { ok: true };
}

// ---- Asistente simulado (datos SINTÉTICOS, no son de Tomás) ----
let turno = 0;
export function activarAsistenteFicticio(params: URLSearchParams) {
  const falla = params.get('asis') === 'error';
  setAsistenteImpl(async (_c, mensaje): Promise<TurnoIA> => {
    await new Promise((r) => setTimeout(r, 400));
    if (falla) throw new Error('Llegaste al máximo de consultas de hoy.');
    turno++;
    const uso = { consultas_hoy: turno, tope_diario: 30, costo_usd: 0.04 };
    if (turno === 1) {
      return { id: 1, uso, respuesta: { tipo: 'pregunta', texto: 'Para proyectarlo bien me faltan dos datos:', preguntas: [
        { texto: '¿Entregás la moto actual?', opciones: ['Sí', 'No'] },
        { texto: '¿Cuándo pagás la primera cuota?', opciones: ['Este mes', 'El mes que viene'] }] } };
    }
    const meses = 39;
    const serie = Array.from({ length: meses }, (_, i) => {
      const d = new Date(2026, 10 + i, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const base = 1000000 + 60000 * i + (i % 6 === 1 ? 900000 : 0);
      return { mes, min_sin: base, min_con: base - 300000 * Math.min(i, 36) + 250000 * Math.floor(i / 2), dias: i === 4 ? 9 : 0 };
    });
    const min = serie.reduce((b, p) => (p.min_con < b.min_con ? p : b));
    return { id: 2, uso, respuesta: {
      tipo: 'veredicto', veredicto: 'ajustado', titulo: 'Moto nueva en 36 cuotas', chips: ['¿Y en 24 cuotas?', '¿Y si la entrego?'],
      recordar: mensaje.includes('dólares') ? 'No usar los dólares para consumo' : undefined,
      texto: 'Te da, pero en marzo quedás bajo el piso unos días. Si arrancás después del aguinaldo, lo evitás.',
      simulaciones: {
        central: { meses, desde: serie[0].mes, hasta: serie[meses - 1].mes, piso: 200000, minimo_con: min.min_con, mes_minimo_con: min.mes,
          minimo_sin: -265000, mes_minimo_sin: serie[0].mes, dias_bajo_piso: 9, primer_dia_bajo_piso: '2027-03-22', quiebre: null,
          dias_bajo_piso_sin: 3, quiebre_sin: '2026-11-23', desde_fecha_compra: '2026-12-10', minimo_con_desde_compra: min.min_con,
          minimo_sin_desde_compra: 1000000, mes_minimo_con_desde_compra: min.mes, egreso_recurrente_sobre_sueldo_pct: 9.6,
          cierre_con: 2500000, cierre_sin: 4000000, costo_total_escenario: 10800000, egreso_mensual_max_escenario: 300000,
          primer_egreso_sobre_sueldo_pct: 9.6, serie,
          supuestos: { sueldo_regla: 'sigue a la inflación con un aumento cada 3 meses', inflacion_mensual: 0.01657,
            inflacion_fuente: 'BCRA REM octubre 2026 (relevado 28-30/10/2026): mediana', alquiler_regla: 'ICL cada 4 meses; contrato hasta 08/2028, después se asume renovación igual' } },
        conservador: { minimo_con: -400000, mes_minimo_con: '2029-10', dias_bajo_piso: 120, cierre_con: -300000, quiebre: '2029-06-30', minimo_con_desde_compra: -400000, minimo_sin_desde_compra: 100000, dias_bajo_piso_sin: 60 },
        optimista: { minimo_con: 150000, mes_minimo_con: '2027-03', dias_bajo_piso: 3, cierre_con: 9000000, quiebre: null },
      } } };
  });
}

// ---- Metas y avisos simulados (datos sintéticos, en memoria) ----
const HOY = '2026-11-10';
const RES = { fondos_ars: 450000, usd: 100, cotizacion: 1520, cotizacion_tipo: 'oficial compra', cotizacion_fecha: HOY, cotizacion_vieja: false, usd_en_ars: 152000, total: 602000 };
let metasSim: any[] | null = null;
let alertasSim: any[] = [];
let sigMeta = 10;
function iniciarSim(p: URLSearchParams) {
  if (metasSim) return;
  metasSim = p.get('metas') === '0' ? [] : [
    { id: 1, nombre: 'Viaje', objetivo: 1500000, fecha_objetivo: '2027-06-30', pct: 0.7, base_fecha: '2026-09-01', base_avance: 150000, estado: 'activa' },
    { id: 2, nombre: 'Fondo de emergencia', objetivo: 3000000, fecha_objetivo: '2027-12-31', pct: 0.3, base_fecha: '2026-11-10', base_avance: 180600, estado: 'activa' },
  ];
  alertasSim = p.get('avisos') === '0' ? [] : [
    { id: 1, tipo: 'aumento', fecha: '2026-11-06', rubro: 'Servicios', titulo: 'Luz subió 8%', estado: 'nueva', resuelta_en: null,
      detalle: { comercio: 'Luz', monto: 21600, monto_anterior: 20000, variacion_pct: 8, umbral_pct: 4.7 } },
    { id: 2, tipo: 'suscripcion_nueva', fecha: '2026-10-20', rubro: 'Suscripciones', titulo: 'Suscripción nueva: Streaming', estado: 'nueva', resuelta_en: null,
      detalle: { comercio: 'Streaming', monto: 9990, primera_vez: '2026-10-20', cargos: 1 }, no_reconocida: false,
      cargo: { tarjeta: 'Visa de prueba (de otra persona)', fecha: '2026-10-20', monto: 9990.5, descripcion: 'STREAMING SA', cupon: '01234',
               resumen_cierre: '2026-10-23', resumen_vencimiento: '2026-11-04', resumen_estado: 'confirmado' } },
    { id: 3, tipo: 'meta_desvio', fecha: HOY, rubro: 'Metas', titulo: 'Meta Viaje: vas atrasado', estado: 'vista', resuelta_en: null,
      detalle: { meta_id: 1, nombre: 'Viaje', avance: 421400, esperado_hoy: 520000, objetivo: 1500000, fecha_objetivo: '2027-06-30', aporte_reserva_mes: 210000 } },
    { id: 4, tipo: 'duplicado', fecha: '2026-11-02', rubro: 'Tarjeta', titulo: 'Posible cargo duplicado', estado: 'validada', resuelta_en: '2026-11-03T10:00:00Z',
      detalle: { comercio: 'Comercio', monto: 5000, fechas: ['2026-11-01', '2026-11-02'] } },
  ];
}
const dias = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;
function calcMeta(m: any, extra = false) {
  const avance = Math.round(m.pct * RES.total);
  const falta = Math.max(m.objetivo - avance, 0);
  const meses = Math.max(dias(HOY, m.fecha_objetivo) / 30.4375, 0);
  const f = Math.min(Math.max(dias(m.base_fecha, HOY) / Math.max(dias(m.base_fecha, m.fecha_objetivo), 1), 0), 1);
  const esperado = Math.round(m.base_avance + (m.objetivo - m.base_avance) * f);
  const llega = m.objetivo < 2500000;
  const estado = avance >= m.objetivo ? 'cumplida' : avance < esperado - 0.1 * m.objetivo ? 'atrasada' : !llega ? 'en_riesgo' : 'en_camino';
  return { id: m.id, nombre: m.nombre, hipotetica: extra, objetivo: m.objetivo, fecha_objetivo: m.fecha_objetivo, pct: m.pct, avance,
    avance_pct: Math.round(1000 * avance / m.objetivo) / 10, falta, meses_restantes: Math.round(meses * 10) / 10,
    necesario_mes: meses >= 0.5 ? Math.round(falta / meses) : null, aporte_reserva_mes: meses >= 0.5 ? Math.round(falta / meses / m.pct) : null,
    esperado_hoy: esperado, desvio: avance - esperado, ritmo_mes: Math.round(m.pct * 120000), fecha_estimada: '2027-09-15',
    proyeccion: { mes: m.fecha_objetivo.slice(0, 7), margen_sobre_piso: llega ? 2400000 : 1800000, necesitas_apartado: m.objetivo + 100000, llega },
    estado, base_fecha: m.base_fecha, creada: m.base_fecha };
}
function estadoMetas() {
  const act = metasSim!.filter((m) => m.estado === 'activa');
  const tot = act.reduce((a, m) => a + m.pct, 0);
  return { hoy: HOY, reserva: RES, ritmo_reserva_mes: 120000, piso: 200000, asignado_pct: tot, libre_pct: Math.max(1 - tot, 0),
    asignado: Math.round(tot * RES.total), libre: Math.round(Math.max(1 - tot, 0) * RES.total),
    valle: { minimo: -230000, fecha: '2026-11-30', asignado_en_pesos: Math.round(tot * RES.fondos_ars), toca_metas: act.length > 0 },
    metas: act.map((m) => calcMeta(m)).sort((a, b) => a.fecha_objetivo.localeCompare(b.fecha_objetivo)),
    historial: Object.fromEntries(act.map((m) => [String(m.id), [
      { fecha: '2026-09-15', avance: Math.round(m.pct * 380000) }, { fecha: '2026-10-15', avance: Math.round(m.pct * 520000) }]])),
    movimientos_reserva: [
      { id: 1, fecha: '2026-11-01', cuenta_id: 101, moneda: 'ARS', monto: 80000, titulo: 'Desde Día a día' },
      { id: 2, fecha: '2026-10-05', cuenta_id: 2, moneda: 'USD', monto: 50, titulo: 'Desde Día a día' }],
    archivadas: metasSim!.filter((m) => m.estado !== 'activa').map((m) => ({ id: m.id, nombre: m.nombre, objetivo: m.objetivo, fecha_objetivo: m.fecha_objetivo, pct: m.pct, estado: m.estado })) };
}
function repartir(fijo: number | null) {
  const act = metasSim!.filter((m) => m.estado === 'activa');
  const f = act.find((m) => m.id === fijo)?.pct ?? 0;
  const otras = act.filter((m) => m.id !== fijo);
  const s = otras.reduce((a, m) => a + m.pct, 0);
  if (s <= 0) { const x = act.find((m) => m.id === fijo); if (x) x.pct = 1; return; }
  otras.forEach((m) => { m.pct = m.pct * (1 - f) / s; m.base_fecha = HOY; m.base_avance = Math.round(m.pct * RES.total); });
}
function simularMetasAvisos(name: string, a: any, params: URLSearchParams) {
  iniciarSim(params);
  if (name === 'rpc_metas') return estadoMetas();
  if (name === 'rpc_meta_simular' || name === 'rpc_meta_guardar') {
    const p = a.p;
    if (!p.nombre?.trim() || !(p.objetivo > 0) || !(p.fecha_objetivo > HOY)) throw new Error('Datos inválidos');
    const otras = metasSim!.filter((m) => m.estado === 'activa' && m.id !== p.id);
    const pct = otras.length ? p.pct : 1;
    if (otras.length && (pct < 0.01 || pct > 0.99)) throw new Error('Elegí un porcentaje entre 1% y 99%');
    if (name === 'rpc_meta_simular') {
      const s = otras.reduce((x, m) => x + m.pct, 0);
      return { meta: calcMeta({ ...p, id: p.id ?? -1, pct, base_fecha: HOY, base_avance: pct * RES.total }, true),
        otras: otras.map((m) => ({ id: m.id, nombre: m.nombre, pct: m.pct * (1 - pct) / s })), reserva: RES };
    }
    let id = p.id;
    if (id) Object.assign(metasSim!.find((m) => m.id === id), { nombre: p.nombre, objetivo: p.objetivo, fecha_objetivo: p.fecha_objetivo, pct, base_fecha: HOY, base_avance: Math.round(pct * RES.total) });
    else { id = ++sigMeta; metasSim!.push({ id, nombre: p.nombre, objetivo: p.objetivo, fecha_objetivo: p.fecha_objetivo, pct, base_fecha: HOY, base_avance: Math.round(pct * RES.total), estado: 'activa' }); }
    repartir(id);
    return { ok: true, id };
  }
  if (name === 'rpc_meta_estado') {
    const m = metasSim!.find((x) => x.id === a.p_id);
    if (a.p_estado === 'archivada') { m.estado = 'archivada'; repartir(null); }
    else { const n = metasSim!.filter((x) => x.estado === 'activa').length; m.estado = 'activa'; m.pct = n ? Math.min(m.pct, 0.99) : 1; repartir(m.id); }
    return { ok: true };
  }
  const nuevas = () => alertasSim.filter((x) => x.estado === 'nueva').length;
  if (name === 'rpc_alertas') return { nuevas: nuevas(), items: JSON.parse(JSON.stringify(alertasSim)) };
  if (name === 'rpc_alerta_marcar') {
    const x = alertasSim.find((y) => y.id === a.p_id);
    if (a.p_estado === 'no_reconocida') { x.estado = 'vista'; x.no_reconocida = true; }
    else { x.estado = a.p_estado; if (a.p_estado === 'validada') x.no_reconocida = false; }
    x.resuelta_en = ['validada', 'descartada'].includes(a.p_estado) ? new Date().toISOString() : null;
    return { ok: true, nuevas: nuevas() };
  }
  if (name === 'rpc_push_estado') return { listo: false, activa: false };
  return { ok: true };
}
