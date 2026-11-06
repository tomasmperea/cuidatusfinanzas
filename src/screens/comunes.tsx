import { ESCENARIOS, type Backup, type Escenario } from '../api';
import { fmtFechaHora } from '../format';
import { Icon, useDetalle } from '../ui';

export const DIAS_BACKUP_VIEJO = 5;

export function esViejo(b: Backup): boolean {
  return b.estado === 'viejo' || (b.dias != null && b.dias >= DIAS_BACKUP_VIEJO);
}

/** Chip de frescura del backup de Expenless. */
export function Frescura({ b }: { b: Backup }) {
  const abrir = useDetalle();
  const viejo = esViejo(b);
  const al = fmtFechaHora(b.ultimo_movimiento);
  return (
    <div class="pad">
      <button class={`fresh${viejo ? ' viejo' : ''}`} data-testid="frescura"
        onClick={() => abrir({
          titulo: 'Frescura de los datos', monto: NaN,
          extra: [
            ['Último movimiento', al],
            ['Backup', b.archivo || '—'],
            ['Procesado', fmtFechaHora(b.procesado_en)],
            ['Antigüedad', b.dias != null ? `${b.dias} ${b.dias === 1 ? 'día' : 'días'}` : '—'],
          ],
          nota: viejo
            ? 'El backup tiene 5 días o más. Mandate el mail "Expenless Data Backup" para actualizar la liquidez.'
            : 'La liquidez sale del último backup de Expenless. Lo que pasó después se estima.',
        })}>
        <Icon n={viejo ? 'warn' : 'clock'} size={18} color={viejo ? 'var(--warn)' : undefined} />
        <span class="t num">{viejo ? <><b>Backup viejo</b> · datos al {al}</> : <>Datos al {al}</>}</span>
        <span class="end"><Icon n="chev" size={18} /></span>
      </button>
    </div>
  );
}

const NOM: Record<Escenario, string> = { conservador: 'Conservador', central: 'Central', optimista: 'Optimista' };
export function SelectorEscenario({ esc, setEsc }: { esc: Escenario; setEsc: (e: Escenario) => void }) {
  return (
    <div class="seg" role="group" aria-label="Escenario">
      {ESCENARIOS.map((e) => (
        <button aria-pressed={esc === e} onClick={() => setEsc(e)} data-esc={e}>
          {esc === e && <Icon n="check" size={15} />}{NOM[e]}
        </button>
      ))}
    </div>
  );
}

export { normalizarTexto } from '../format';
