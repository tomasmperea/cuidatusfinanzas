// SOLO DESARROLLO. Se importa dentro de `if (import.meta.env.DEV)`, así que no entra en el build.
// Los JSON se sirven desde ../fixtures (fuera del repo) con el plugin `fixtures` de vite.config.ts.
import { setRpcImpl } from './api';

const ARCHIVO: Record<string, string> = {
  rpc_kpis: 'kpis', rpc_forecast: 'forecast', rpc_calendario_mes: 'calendario',
  rpc_ingresos_egresos_mes: 'ingresos_egresos', rpc_liquidez_comprometida: 'liquidez_comprometida',
  rpc_compromisos: 'compromisos', rpc_snapshot_semanal: 'snapshot', rpc_ajustes: 'ajustes', rpc_dashboard: 'dashboard',
  rpc_caja: 'caja',
};

export function activarFixtures(params: URLSearchParams) {
  const fallan = (params.get('error') || '').split(',').filter(Boolean);
  const backupDias = params.get('backup_dias');
  setRpcImpl(async (name, args) => {
    await new Promise((r) => setTimeout(r, 60));
    if (fallan.includes('all') || fallan.includes(name)) throw new Error('Fallo simulado (modo desarrollo)');
    if (name.startsWith('rpc_mov_') || name === 'rpc_pendiente_descartar') return simularEscritura(name, args);
    if (name === 'rpc_caja' && caja) return JSON.parse(JSON.stringify(caja));
    const res = await fetch(`/__fixtures/${ARCHIVO[name]}.json`);
    if (!res.ok) throw new Error(`Sin fixture para ${name}`);
    let data = await res.json();
    const esc = args.p_escenario as string | undefined;
    if (esc && data && !Array.isArray(data) && data[esc]) data = data[esc];
    if (name === 'rpc_caja') { caja = data; return JSON.parse(JSON.stringify(caja)); }
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
