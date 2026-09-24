import { BRAND_COLORS, getTheme } from '../constants/theme';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('getTheme', () => {
  it('sin marca usa los tokens del diseño', () => {
    const dia = getTheme('day');
    expect(dia.bg).toBe('#FBF6EF');
    expect(dia.br).toBe('#C2703A');
    expect(dia.brs).toBe('#F7E7D6');
    const noche = getTheme('night');
    expect(noche.bg).toBe('#14100D');
    expect(noche.br).toBe('#E08A4C');
    expect(noche.brs).toBe('#2C1F16');
  });

  it('elegir explícitamente el naranja por defecto da exactamente los tokens del diseño', () => {
    expect(getTheme('day', '#C2703A')).toEqual(getTheme('day'));
    expect(getTheme('day', '#c2703a')).toEqual(getTheme('day'));
    expect(getTheme('night', '#C2703A')).toEqual(getTheme('night'));
  });

  it('con otra marca calcula el suave en OKLab (claro, cercano al fondo) solo de día', () => {
    const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const luminancia = (hex: string) => canal(hex, 0) + canal(hex, 1) + canal(hex, 2);
    for (const marca of BRAND_COLORS.filter((m) => m !== '#C2703A')) {
      const dia = getTheme('day', marca);
      expect(dia.br).toBe(marca);
      expect(dia.brs).toMatch(HEX);
      expect(luminancia(dia.brs)).toBeGreaterThan(luminancia(marca));
      expect(luminancia(dia.brs)).toBeGreaterThan(3 * 200);
      expect(getTheme('night', marca).brs).toBe('#2C1F16');
    }
  });
});
