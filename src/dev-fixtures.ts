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
          minimo_sin: 1000000, mes_minimo_sin: serie[0].mes, dias_bajo_piso: 9, primer_dia_bajo_piso: '2027-03-22', quiebre: null,
          cierre_con: 2500000, cierre_sin: 4000000, costo_total_escenario: 10800000, egreso_mensual_max_escenario: 300000,
          primer_egreso_sobre_sueldo_pct: 9.6, serie,
          supuestos: { sueldo_regla: 'sigue a la inflación con un aumento cada 3 meses', inflacion_mensual: 0.01657,
            inflacion_fuente: 'BCRA REM octubre 2026 (relevado 28-30/10/2026): mediana', alquiler_regla: 'ICL cada 4 meses; contrato hasta 08/2028, después se asume renovación igual' } },
        conservador: { minimo_con: -400000, mes_minimo_con: '2029-10', dias_bajo_piso: 120, cierre_con: -300000, quiebre: '2029-06-30' },
        optimista: { minimo_con: 150000, mes_minimo_con: '2027-03', dias_bajo_piso: 3, cierre_con: 9000000, quiebre: null },
      } } };
  });
}
