import { api, type Compromiso } from '../api';
import { Icon, Load, useAsync } from '../ui';
import { FilaCompromiso, nombreCompromiso } from './Inicio';

export function Compromisos() {
  const comp = useAsync(() => api.compromisos(), []);
  return (
    <Load a={comp} que="los compromisos" h={400}>
      {(c) => c.length === 0
        ? <section class="card"><div class="small">No hay compromisos en los próximos 90 días.</div></section>
        : agrupar(c).map(([nombre, items]) => (
          <section class="card" aria-label={nombre} style="gap:2px;padding:12px 14px 4px">
            <h2 style="display:flex;align-items:center;gap:8px">
              <Icon n={items[0].tipo === 'fijo' ? 'casa' : 'card'} size={18} />{nombre}
            </h2>
            <ul class="rows">{items.map((x) => <FilaCompromiso c={x} sinNombre />)}</ul>
          </section>
        ))}
    </Load>
  );
}

function agrupar(c: Compromiso[]): Array<[string, Compromiso[]]> {
  const m = new Map<string, Compromiso[]>();
  for (const x of c) {
    const k = nombreCompromiso(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return [...m.entries()];
}
