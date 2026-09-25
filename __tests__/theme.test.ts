import { BRAND_COLORS, CONTRASTE_MINIMO, contraste, getTheme, type ThemeMode } from '../constants/theme';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MODOS: ThemeMode[] = ['day', 'night'];

describe('getTheme', () => {
  it('sin marca respeta el diseño donde ya se lee bien', () => {
    const dia = getTheme('day');
    expect(dia.bg).toBe('#FBF6EF');
    expect(dia.brs).toBe('#F7E7D6');
    const noche = getTheme('night');
    expect(noche.bg).toBe('#14100D');
    // El naranja de noche del diseño ya cumple: no se toca.
    expect(noche.br).toBe('#E08A4C');
    expect(noche.brs).toBe('#2C1F16');
    expect(noche.gold).toBe('#D8A85A');
  });

  it('elegir explícitamente el naranja por defecto da exactamente los mismos tokens', () => {
    expect(getTheme('day', '#C2703A')).toEqual(getTheme('day'));
    expect(getTheme('day', '#c2703a')).toEqual(getTheme('day'));
    expect(getTheme('night', '#C2703A')).toEqual(getTheme('night'));
  });

  it('con otra marca calcula el suave en OKLab: claro de día, oscuro de noche', () => {
    const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const suma = (hex: string) => canal(hex, 0) + canal(hex, 1) + canal(hex, 2);
    for (const marca of BRAND_COLORS.filter((m) => m !== '#C2703A')) {
      const dia = getTheme('day', marca);
      expect(dia.brs).toMatch(HEX);
      expect(suma(dia.brs)).toBeGreaterThan(3 * 200);
      const noche = getTheme('night', marca);
      expect(noche.brs).toMatch(HEX);
      expect(suma(noche.brs)).toBeLessThan(3 * 70);
    }
  });

  it('todo acento usado como texto se lee con 4,5:1 en cualquier marca y modo (DESIGN.md §5)', () => {
    for (const modo of MODOS) {
      for (const marca of [undefined, ...BRAND_COLORS]) {
        const t = getTheme(modo, marca);
        for (const fondo of [t.bg, t.sf]) {
          for (const acento of [t.br, t.gold, t.ok, t.dg]) {
            expect(contraste(acento, fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
          }
        }
        expect(contraste(t.br, t.brs)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        // El texto de los botones y estados elegidos también.
        expect(contraste(t.onBr, t.br)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        expect(contraste(t.onGold, t.gold)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        expect(contraste(t.onOk, t.ok)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      }
    }
  });

  it('ninguna marca ofrecida es el dorado competitivo', () => {
    expect(BRAND_COLORS.map((m) => m.toUpperCase())).not.toContain(getTheme('day').gold.toUpperCase());
    expect(BRAND_COLORS).not.toContain('#B68235');
  });
});
