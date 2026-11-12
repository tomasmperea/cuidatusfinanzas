// "¿Qué tarjeta uso hoy?" (Caja): cuántos días tenés para pagar lo que compres hoy, y cuándo cierra cada una.
// Más días primero; si empatan, primero la que cierra antes. Plegada muestra solo la mejor.
import { useState } from 'preact/hooks';
import { api, type TarjetaHoy } from '../api';
import { fmtDDMM, sumarDias } from '../format';
import { Icon, useAsync } from '../ui';

/** Nombre corto: sin la aclaración entre paréntesis y "Master" en vez de "MasterCard". */
export const nombreCorto = (n: string) => n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\bMastercard\b/i, 'Master').replace(/\s+/g, ' ').trim();

function cierre(t: TarjetaHoy, hoy: string) {
  if (!t.cierre) return 'Cierre sin confirmar';
  if (t.cierre === hoy) return 'Cierra hoy';
  if (t.cierre === sumarDias(hoy, 1)) return 'Cierra mañana';
  return `Cierra ${fmtDDMM(t.cierre)}`;
}

export function TarjetasHoy() {
  const a = useAsync(() => api.tarjetasHoy(), []);
  const [abierta, setAbierta] = useState(false);
  const d = a.data;
  if (a.error || !d || !d.tarjetas.length) return null;   // ayuda, no crítica: si falla no ocupa lugar
  const lista = [...d.tarjetas].sort((x, y) => y.dias - x.dias || (x.cierre ?? '9').localeCompare(y.cierre ?? '9'));
  const mejor = lista[0];
  return (
    <section class="card tarjetas-hoy" aria-label="¿Qué tarjeta uso hoy?" data-testid="tarjetas-hoy">
      <button class="th-head" aria-expanded={abierta} onClick={() => setAbierta(!abierta)} data-testid="tarjetas-hoy-toggle">
        <Icon n="card" size={20} />
        <span class="ell" style="flex:1;text-align:left">
          <span class="small">¿Qué tarjeta uso hoy?</span>
          <b class="ell th-mejor">{nombreCorto(mejor.nombre)}</b>
        </span>
        <span class="th-dias num" aria-label={`${mejor.dias} días para pagar`}><b>{mejor.dias}</b><span class="small">días</span></span>
        <span class={`th-chev${abierta ? ' abierta' : ''}`} aria-hidden="true"><Icon n="chev" size={18} /></span>
      </button>
      {abierta && (
        <ul class="rows" data-testid="tarjetas-hoy-lista">
          {lista.map((t) => (
            <li class="th-fila">
              <div class="th-l1"><b class="ell">{nombreCorto(t.nombre)}</b><span class="num"><b>{t.dias}</b> días</span></div>
              <div class="small num">
                <span class={t.cierre === d.hoy ? 'warn' : ''}>{cierre(t, d.hoy)}</span> · pagás {fmtDDMM(t.paga)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
