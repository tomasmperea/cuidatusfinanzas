import { describe, expect, it } from 'vitest';
import {
  fmtAbrev, fmtCompacto, fmtExacto, fmtEntero, fmtPct, fmtUSD,
  fmtDDMM, fmtDia, fmtDiaCap, fmtMes, sumarDias, fmtFechaHora, hoyAR, diaSemana,
} from './format';

const N = ' ';
const M = '−';

describe('montos abreviados (es-AR, 2 decimales, k/M)', () => {
  it('millones', () => {
    expect(fmtAbrev(3223496)).toBe(`$3,22${N}M`);
    expect(fmtAbrev(6652832.63)).toBe(`$6,65${N}M`);
    expect(fmtAbrev(12_500_000)).toBe(`$12,50${N}M`);
  });
  it('miles', () => {
    expect(fmtAbrev(149018.69)).toBe(`$149,02${N}k`);
    expect(fmtAbrev(39512.47)).toBe(`$39,51${N}k`);
    expect(fmtAbrev(1000)).toBe(`$1,00${N}k`);
  });
  it('menos de mil', () => {
    expect(fmtAbrev(950)).toBe('$950');
    expect(fmtAbrev(26.5)).toBe('$26,50');
    expect(fmtAbrev(0)).toBe('$0');
  });
  it('negativos con signo − (U+2212)', () => {
    expect(fmtAbrev(-149018.69)).toBe(`${M}$149,02${N}k`);
    expect(fmtAbrev(-729047.75)).toBe(`${M}$729,05${N}k`);
    expect(fmtAbrev(-1558851.1)).toBe(`${M}$1,56${N}M`);
    expect(fmtAbrev(-5)).toBe(`${M}$5`);
    expect(fmtAbrev(-1)).not.toContain('-');
  });
  it('signo + opcional', () => {
    expect(fmtAbrev(17287.15, { signoMas: true })).toBe(`+$17,29${N}k`);
    expect(fmtAbrev(-17287.15, { signoMas: true })).toBe(`${M}$17,29${N}k`);
  });
  it('salto de unidad al redondear', () => {
    expect(fmtAbrev(999_999)).toBe(`$1,00${N}M`);
    expect(fmtAbrev(999.996)).toBe(`$1,00${N}k`);
    expect(fmtAbrev(999_994)).toBe(`$999,99${N}k`);
  });
  it('valores nulos', () => {
    expect(fmtAbrev(null)).toBe('—');
    expect(fmtAbrev(undefined)).toBe('—');
    expect(fmtAbrev(NaN)).toBe('—');
  });
  it('compacto para el calendario', () => {
    expect(fmtCompacto(3262196)).toBe('3,26M');
    expect(fmtCompacto(-10410)).toBe(`${M}10,41k`);
  });
});

describe('montos exactos', () => {
  it('con y sin centavos', () => {
    expect(fmtExacto(3223496)).toBe('$3.223.496');
    expect(fmtExacto(-149018.69)).toBe(`${M}$149.018,69`);
    expect(fmtExacto(926248.17)).toBe('$926.248,17');
    expect(fmtExacto(1307550.02)).toBe('$1.307.550,02');
    expect(fmtExacto(6089.85, { signoMas: true })).toBe('+$6.089,85');
  });
  it('redondeado a pesos', () => {
    expect(fmtEntero(-149018.69)).toBe(`${M}$149.019`);
    expect(fmtEntero(200000)).toBe('$200.000');
    expect(fmtEntero(-0.2)).toBe('$0');
  });
  it('USD y porcentajes', () => {
    expect(fmtUSD(26.99)).toBe(`USD${N}26,99`);
    expect(fmtPct(-48.36)).toBe(`${M}48,36%`);
    expect(fmtPct(12.9)).toBe('12,9%');
    expect(fmtPct(7.97, { signoMas: true })).toBe('+7,97%');
  });
});

describe('fechas', () => {
  it('día y mes', () => {
    expect(fmtDDMM('2026-11-10')).toBe('10/11');
    expect(fmtDia('2026-11-10')).toBe('mar 10/11');
    expect(fmtDia('2026-11-11')).toBe('mié 11/11');
    expect(fmtDia('2026-11-14')).toBe('sáb 14/11');
    expect(fmtDiaCap('2026-11-06')).toBe('Vie 06/11');
    expect(fmtMes('2026-11-01')).toBe('Noviembre 2026');
    expect(diaSemana('2026-11-30')).toBe(1);
  });
  it('sumar días cruzando mes y año', () => {
    expect(sumarDias('2026-11-06', 7)).toBe('2026-11-13');
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
  it('timestamps: sin huso se muestran tal cual, con huso pasan a hora AR', () => {
    expect(fmtFechaHora('2026-11-04T20:13:00')).toBe('04/11 20:13');
    expect(fmtFechaHora('2026-11-06T13:34:11.459757+00:00')).toBe('06/11 10:34');
    expect(fmtFechaHora('2026-11-07T02:00:00Z')).toBe('06/11 23:00');
    expect(fmtFechaHora(null)).toBe('—');
  });
  it('hoy en AR (UTC−3)', () => {
    expect(hoyAR(new Date('2026-11-07T02:30:00Z'))).toBe('2026-11-06');
    expect(hoyAR(new Date('2026-11-07T03:30:00Z'))).toBe('2026-11-07');
  });
});
