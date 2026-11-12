// "¿Qué tarjeta uso hoy?" (Caja): para cada tarjeta, cuándo pagás lo que compres hoy y cuándo cierra.
// Ordenadas por días hasta el pago (más días primero). Plegada muestra solo la mejor.
import { useState } from 'preact/hooks';
import { api, type TarjetaHoy } from '../api';
import { fmtDDMM, sumarDias } from '../format';
import { Icon, useAsync } from '../ui';

function cierreTxt(t: TarjetaHoy, hoy: string) {
  if (!t.cierre) return 'cierre sin confirmar';
  if (t.cierre === hoy) return 'cierra hoy';
  if (t.cierre === sumarDias(hoy, 1)) return 'cierra mañana';
  return `cierra el ${fmtDDMM(t.cierre)}`;
}
const pagaTxt = (t: TarjetaHoy) => (t.reintegro ? `reintegrás el ${fmtDDMM(t.paga)}` : `la pagás el ${fmtDDMM(t.paga)}`);

export function TarjetasHoy() {
  const a = useAsync(() => api.tarjetasHoy(), []);
  const [abierta, setAbierta] = useState(false);
  const d = a.data;
  if (a.error || !d || !d.tarjetas.length) return null;   // ayuda, no crítica: si falla no ocupa lugar
  const mejor = d.tarjetas[0];
  return (
    <section class="card tarjetas-hoy" aria-label="¿Qué tarjeta uso hoy?" data-testid="tarjetas-hoy">
      <button class="th-head" aria-expanded={abierta} onClick={() => setAbierta(!abierta)} data-testid="tarjetas-hoy-toggle">
        <Icon n="card" size={20} />
        <span class="ell" style="flex:1;text-align:left">
          <span class="small">¿Qué tarjeta uso hoy?</span>
          <b class="ell th-mejor">{mejor.nombre}</b>
        </span>
        <span class="th-dias num" aria-label={`${mejor.dias} días para pagar`}><b>{mejor.dias}</b><span class="small">días</span></span>
        <span class={`th-chev${abierta ? ' abierta' : ''}`} aria-hidden="true"><Icon n="chev" size={18} /></span>
      </button>
      {abierta && (
        <ul class="rows" data-testid="tarjetas-hoy-lista">
          {d.tarjetas.map((t) => (
            <li class="th-fila">
              <div class="ell"><b>{t.nombre}</b></div>
              <div class="small num">
                Si comprás hoy, {pagaTxt(t)} <b style="color:var(--fg)">({t.dias} días)</b>
              </div>
              <div class={`small num${t.cierre === d.hoy ? ' warn' : ''}`}>
                {cierreTxt(t, d.hoy)}
                {t.paga_despues_cierre && ` · después del cierre se paga el ${fmtDDMM(t.paga_despues_cierre)}`}
                {t.reintegro && t.vto_banco && ` · el banco debita el ${fmtDDMM(t.vto_banco)}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
