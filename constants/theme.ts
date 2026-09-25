// Sistema de diseño de Duel — tokens portados del handoff de diseño
// (paleta día/noche, tipografía y escalas de espacio/radio).

export type ThemeMode = 'day' | 'night';

export interface ThemeTokens {
  bg: string;
  sf: string;
  ink: string;
  dim: string;
  line: string;
  br: string;
  brs: string;
  gold: string;
  ok: string;
  dg: string;
  shade: string;
  /** Texto sobre un relleno br (botón principal, contador). */
  onBr: string;
  /** Texto sobre un relleno gold (resultado elegido). */
  onGold: string;
  /** Texto sobre un relleno ok (resultado confirmado). */
  onOk: string;
}

interface BaseTokens {
  bg: string;
  sf: string;
  ink: string;
  dim: string;
  line: string;
  gold: string;
  ok: string;
  dg: string;
  shade: string;
  brDefault: string;
  brsDefault: string;
}

const DAY: BaseTokens = {
  bg: '#FBF6EF',
  sf: '#FFFFFF',
  ink: '#241A13',
  dim: '#8A7362',
  line: '#E8DCCE',
  gold: '#B68235',
  ok: '#5E8A57',
  dg: '#C1553F',
  shade: 'rgba(36,26,19,0.04)',
  brDefault: '#C2703A',
  brsDefault: '#F7E7D6',
};

const NIGHT: BaseTokens = {
  bg: '#14100D',
  sf: '#1D1714',
  ink: '#F4ECE2',
  dim: '#9C8A79',
  line: '#332821',
  gold: '#D8A85A',
  ok: '#8FA97B',
  dg: '#D9705A',
  shade: 'rgba(255,255,255,0.04)',
  brDefault: '#E08A4C',
  brsDefault: '#2C1F16',
};

/**
 * Opciones de color de marca ofrecidas en Ajustes → Apariencia. Ninguna se parece al dorado
 * competitivo (gold): naranja/marca es operación del café, dorado es torneo.
 */
export const BRAND_COLORS = ['#C2703A', '#4A5A80', '#7A5C3E', '#3F6B58', '#8A3B4C'] as const;
export type BrandColor = (typeof BRAND_COLORS)[number];

// ---- Mezcla en espacio OKLab (equivalente a color-mix(in oklab, …) del prototipo) ----

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

/** Mezcla `hexA` en proporción `pct` (0–1) sobre `hexB`, replicando color-mix(in oklab, …). */
function mixOklab(hexA: string, pct: number, hexB: string): string {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg, bb] = hexToRgb(hexB);
  const [aL, aa, aB] = rgbToOklab(ar, ag, ab);
  const [bL, ba, bB] = rgbToOklab(br, bg, bb);
  const L = aL * pct + bL * (1 - pct);
  const a = aa * pct + ba * (1 - pct);
  const b = aB * pct + bB * (1 - pct);
  const [r, g, bl] = oklabToRgb(L, a, b);
  return rgbToHex(r, g, bl);
}

// ---- Contraste (WCAG 2.x) ----

function luminancia(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores opacos (1 a 21). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** DESIGN.md §5: todo texto chico con al menos 4,5:1. */
export const CONTRASTE_MINIMO = 4.5;

/**
 * Corre la luminosidad (OKLab, mismo tono y croma) lo justo para que el color llegue al
 * contraste mínimo contra todos los fondos: más oscuro de día, más claro de noche. Si ya
 * llega, queda igual (los colores del diseño que cumplen no se tocan).
 */
function legibleSobre(hex: string, fondos: readonly string[], aclarar: boolean): string {
  const cumple = (c: string) => fondos.every((f) => contraste(c, f) >= CONTRASTE_MINIMO);
  if (cumple(hex)) return hex;
  const [r, g, b] = hexToRgb(hex);
  const [L, A, B] = rgbToOklab(r, g, b);
  for (let paso = 1; paso <= 60; paso++) {
    const nuevoL = aclarar ? Math.min(1, L + paso * 0.01) : Math.max(0, L - paso * 0.01);
    const candidato = rgbToHex(...oklabToRgb(nuevoL, A, B));
    if (cumple(candidato)) return candidato;
  }
  return aclarar ? '#FFFFFF' : '#000000';
}

const TEXTO_CLARO = '#FFFFFF';
const TEXTO_OSCURO = '#14100D';

/** Blanco u oscuro, el que más contraste dé sobre un relleno de color. */
function textoSobre(relleno: string): string {
  return contraste(TEXTO_CLARO, relleno) >= contraste(TEXTO_OSCURO, relleno) ? TEXTO_CLARO : TEXTO_OSCURO;
}

/**
 * Tokens completos para un modo y una marca dados.
 * El prototipo sólo recalcula `--brs` en modo día (16% de la marca mezclado
 * sobre el fondo claro); de noche el suave se deriva de la marca sobre el fondo oscuro.
 * Los acentos que se usan como texto (br, gold, ok, dg) se ajustan para leerse con
 * 4,5:1 sobre bg, sf y el suave, en cualquier marca y modo.
 */
export function getTheme(mode: ThemeMode, brand?: string): ThemeTokens {
  const base = mode === 'day' ? DAY : NIGHT;
  const esDefault = !brand || brand.toUpperCase() === DAY.brDefault;
  const noche = mode === 'night';
  const marca = esDefault ? base.brDefault : brand;
  const brs = esDefault ? base.brsDefault : noche ? mixOklab(brand, 0.2, NIGHT.bg) : mixOklab(brand, 0.16, DAY.bg);
  const fondos = [base.bg, base.sf];
  const br = legibleSobre(marca, [...fondos, brs], noche);
  const gold = legibleSobre(base.gold, fondos, noche);
  const ok = legibleSobre(base.ok, fondos, noche);
  return {
    bg: base.bg,
    sf: base.sf,
    ink: base.ink,
    dim: base.dim,
    line: base.line,
    gold,
    ok,
    dg: legibleSobre(base.dg, fondos, noche),
    shade: base.shade,
    br,
    brs,
    onBr: textoSobre(br),
    onGold: textoSobre(gold),
    onOk: textoSobre(ok),
  };
}

export const Typography = {
  fontFamily: {
    light: 'PlusJakartaSans_300Light',
    regular: 'PlusJakartaSans_400Regular',
    regularItalic: 'PlusJakartaSans_400Regular_Italic',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
  },
};

/** Estilo tabular para cifras (equivalente a font-feature-settings:'tnum'). */
export function tabularNums(fontSize: number) {
  return { fontVariant: ['tabular-nums' as const], letterSpacing: -0.02 * fontSize };
}

export const Radii = {
  chip: 9,
  stepper: 9,
  counter: 8,
  field: 12,
  card: 13,
  buttonLg: 14,
  avatar: 13,
  roomBoard: 16,
  cafeTable: 18,
  duelTable: 12,
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 6,
  smd: 8,
  md: 10,
  mdl: 12,
  lg: 14,
  lgx: 16,
  xl: 18,
  xxl: 20,
  xxxl: 22,
  screen: 26,
};
