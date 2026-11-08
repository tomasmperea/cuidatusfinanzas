// Notificación push del resumen semanal: solo un llamador ("Tu resumen semanal está listo"), sin montos.
import { SUPABASE_URL, supabase } from './api';

const FUNCION = `${SUPABASE_URL}/functions/v1/push-semanal`;

export type EstadoPush = 'no-soportado' | 'bloqueado' | 'sin-configurar' | 'activo' | 'inactivo';

export function soportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!soportado()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  const sub = await suscripcionActual();
  const r = await rpc<{ listo: boolean; activa: boolean }>('rpc_push_estado', { p_endpoint: sub?.endpoint ?? '' });
  if (!r.listo) return 'sin-configurar';
  return sub && r.activa ? 'activo' : 'inactivo';
}

function aBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4);
  const out = new Uint8Array(new ArrayBuffer(atob(b64).length));
  atob(b64).split("").forEach((c, i) => { out[i] = c.charCodeAt(0); });
  return out;
}

export async function activarPush(): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para notificaciones');
  const r = await fetch(FUNCION, { method: 'GET' });
  if (!r.ok) throw new Error('Las notificaciones todavía no están configuradas');
  const { clave_publica } = (await r.json()) as { clave_publica: string };
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();   // por si cambió la clave
  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave_publica) });
  await rpc('rpc_push_suscribir', { p: sub.toJSON() });
}

export async function desactivarPush(): Promise<void> {
  const sub = await suscripcionActual();
  if (!sub) return;
  await rpc('rpc_push_desuscribir', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export async function probarPush(): Promise<void> {
  await rpc('rpc_push_probar', {});
}
