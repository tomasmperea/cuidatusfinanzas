import { describe, expect, it } from 'vitest';
import { aTexto, evaluar, mostrar, teclear, tieneOperacion, type Tecla } from './calc';

const tipear = (teclas: string) => [...teclas].reduce((e, t) => teclear(e, (t === 'D' ? 'del' : t) as Tecla), '');

describe('calculadora', () => {
  it('suma y muestra con separador de miles', () => {
    const e = tipear('18540+6460');
    expect(mostrar(e)).toBe('18.540 + 6.460');
    expect(evaluar(e)).toBe(25000);
    expect(tieneOperacion(e)).toBe(true);
  });
  it('respeta × y ÷ antes que + y −', () => {
    expect(evaluar(tipear('1000+3*500'))).toBe(2500);
    expect(evaluar(tipear('9000/3-1000'))).toBe(2000);
  });
  it('decimales: coma, máximo 2', () => {
    expect(tipear('12,345')).toBe('12,34');
    expect(evaluar('12,34')).toBe(12.34);
    expect(tipear(',5')).toBe('0,5');
  });
  it('operadores: reemplaza el último, ignora al principio y al final', () => {
    expect(tipear('+5')).toBe('5');
    expect(tipear('5+-3')).toBe('5-3');
    expect(evaluar('5+')).toBe(5);
  });
  it('= colapsa el resultado y se puede seguir operando', () => {
    const e = tipear('100/3=');
    expect(e).toBe('33,33');
    expect(evaluar(tipear('100/3=*3'))).toBe(99.99);
  });
  it('división por cero y vacío no dan número', () => {
    expect(evaluar('5/0')).toBeNull();
    expect(evaluar('')).toBeNull();
  });
  it('borrar y ceros a la izquierda', () => {
    expect(tipear('123D')).toBe('12');
    expect(tipear('007')).toBe('7');
    expect(aTexto(1500.5)).toBe('1500,5');
  });
});
