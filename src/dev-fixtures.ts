// SOLO DESARROLLO. Se importa dentro de `if (import.meta.env.DEV)`, así que no entra en el build.
// Los JSON se sirven desde ../fixtures (fuera del repo) con el plugin `fixtures` de vite.config.ts.
import { setRpcImpl } from './api';

const ARCHIVO: Record<string, string> = {
  rpc_kpis: 'kpis', rpc_forecast: 'forecast', rpc_calendario_mes: 'calendario',
  rpc_ingresos_egresos_mes: 'ingresos_egresos', rpc_liquidez_comprometida: 'liquidez_comprometida',
  rpc_compromisos: 'compromisos', rpc_snapshot_semanal: 'snapshot', rpc_ajustes: 'ajustes', rpc_dashboard: 'dashboard',
};

export function activarFixtures(params: URLSearchParams) {
  const fallan = (params.get('error') || '').split(',').filter(Boolean);
  const backupDias = params.get('backup_dias');
  setRpcImpl(async (name, args) => {
    await new Promise((r) => setTimeout(r, 60));
    if (fallan.includes('all') || fallan.includes(name)) throw new Error('Fallo simulado (modo desarrollo)');
    const res = await fetch(`/__fixtures/${ARCHIVO[name]}.json`);
    if (!res.ok) throw new Error(`Sin fixture para ${name}`);
    let data = await res.json();
    const esc = args.p_escenario as string | undefined;
    if (esc && data && !Array.isArray(data) && data[esc]) data = data[esc];
    if (name === 'rpc_kpis' && backupDias) data = { ...data, backup: { ...data.backup, dias: Number(backupDias), estado: 'viejo' } };
    return data;
  });
}
