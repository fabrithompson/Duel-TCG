import { CONTRASTE_MINIMO, contraste, getTheme, type ThemeMode } from '../constants/theme';

const MODOS: ThemeMode[] = ['day', 'night'];

describe('getTheme', () => {
  it('respeta el diseño donde ya se lee bien', () => {
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

  it('todo acento usado como texto se lee con 4,5:1 de día y de noche (DESIGN.md §5)', () => {
    for (const modo of MODOS) {
      const t = getTheme(modo);
      for (const fondo of [t.bg, t.sf]) {
        for (const acento of [t.br, t.gold, t.ok, t.dg, t.dim]) {
          expect(contraste(acento, fondo)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
        }
      }
      expect(contraste(t.br, t.brs)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      // El texto secundario también se lee sobre el suave (fila propia en la Tabla, chips activos).
      expect(contraste(t.dim, t.brs)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      // El texto de los botones y estados elegidos también.
      expect(contraste(t.onBr, t.br)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(t.onGold, t.gold)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      expect(contraste(t.onOk, t.ok)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    }
  });

  it('el naranja del café y el dorado del torneo no se confunden', () => {
    for (const modo of MODOS) {
      const t = getTheme(modo);
      expect(t.br.toUpperCase()).not.toBe(t.gold.toUpperCase());
    }
  });
});
