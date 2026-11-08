import { ESCENARIOS, type Escenario } from '../api';
import { Icon } from '../ui';

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
