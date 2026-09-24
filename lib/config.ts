import { minutosDelDia } from './fecha';

// Configuración del local, editable desde Ajustes (solo admin).
//  - `config/publico`: todo lo de abajo. Lectura pública (el splash muestra
//    el nombre y el color antes de iniciar sesión).
//  - `config/privado`: `{ codigoInvitacion }`. Solo admin la lee; las reglas
//    de Firestore la usan para validar el registro de mozo/juez.

export interface Turno {
  nombre: string;
  apertura: string; // HH:MM
  cierre: string; // HH:MM — puede ser menor que apertura (turno que cruza medianoche)
}

export interface DefaultsTorneo {
  rondas: number;
  minutos: number;
  extra: number;
  inscripcion: number;
  cupo: number;
}

export interface Temporada {
  nombre: string;
  /** YYYY-MM-DD; null = cuentan todos los torneos. */
  inicio: string | null;
}

export interface ConfigLocal {
  nombreLocal: string;
  logoUrl: string | null;
  /** Hex #RRGGBB; null = color de marca por defecto del tema. */
  marca: string | null;
  oscuroPorDefecto: boolean;
  turnos: Turno[];
  alertaStock: number;
  torneo: DefaultsTorneo;
  temporada: Temporada;
  /** Los jugadores pueden reportar su resultado desde el celular. */
  reporteJugador: boolean;
  /** Los premios pueden incluir crédito de cafetería. */
  creditoPremio: boolean;
  /** Cobrar un pedido descuenta stock. */
  descontarStock: boolean;
}

export interface ConfigPrivada {
  codigoInvitacion: string | null;
}

export const LIMITES = {
  rondas: { min: 1, max: 12 },
  minutos: { min: 10, max: 120 },
  extra: { min: 0, max: 15 },
  inscripcion: { min: 0, max: 1_000_000 },
  cupo: { min: 2, max: 256 },
  alertaStock: { min: 0, max: 1000 },
} as const;

export const CONFIG_DEFAULT: ConfigLocal = {
  nombreLocal: 'Duel',
  logoUrl: null,
  marca: null,
  oscuroPorDefecto: false,
  turnos: [
    { nombre: 'Mañana', apertura: '08:00', cierre: '15:00' },
    { nombre: 'Tarde', apertura: '15:00', cierre: '00:30' },
  ],
  alertaStock: 5,
  torneo: { rondas: 5, minutos: 50, extra: 3, inscripcion: 6000, cupo: 16 },
  temporada: { nombre: 'Temporada 1', inicio: null },
  reporteJugador: true,
  creditoPremio: true,
  descontarStock: true,
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function numeroEn(valor: unknown, fallback: number, lim: { min: number; max: number }): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return fallback;
  return Math.min(lim.max, Math.max(lim.min, Math.round(valor)));
}

function texto(valor: unknown, fallback: string, max = 60): string {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : fallback;
}

function booleano(valor: unknown, fallback: boolean): boolean {
  return typeof valor === 'boolean' ? valor : fallback;
}

function turnosValidos(valor: unknown): Turno[] {
  if (!Array.isArray(valor)) return CONFIG_DEFAULT.turnos;
  const turnos = valor
    .filter((t): t is Turno =>
      !!t &&
      typeof t === 'object' &&
      typeof (t as Turno).nombre === 'string' &&
      minutosDelDia((t as Turno).apertura) !== null &&
      minutosDelDia((t as Turno).cierre) !== null
    )
    .map((t) => ({ nombre: t.nombre.trim().slice(0, 24) || 'Turno', apertura: t.apertura, cierre: t.cierre }));
  return turnos.length > 0 ? turnos.slice(0, 4) : CONFIG_DEFAULT.turnos;
}

/**
 * Normaliza lo que venga de Firestore: cualquier campo faltante o inválido
 * cae a su default, así un documento viejo o editado a mano nunca rompe la app.
 */
export function normalizarConfig(raw: unknown): ConfigLocal {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = (r.torneo && typeof r.torneo === 'object' ? r.torneo : {}) as Record<string, unknown>;
  const temp = (r.temporada && typeof r.temporada === 'object' ? r.temporada : {}) as Record<string, unknown>;
  const d = CONFIG_DEFAULT;
  return {
    nombreLocal: texto(r.nombreLocal, d.nombreLocal),
    logoUrl: typeof r.logoUrl === 'string' && r.logoUrl.startsWith('https://') ? r.logoUrl : null,
    marca: typeof r.marca === 'string' && HEX.test(r.marca) ? r.marca.toUpperCase() : null,
    oscuroPorDefecto: booleano(r.oscuroPorDefecto, d.oscuroPorDefecto),
    turnos: turnosValidos(r.turnos),
    alertaStock: numeroEn(r.alertaStock, d.alertaStock, LIMITES.alertaStock),
    torneo: {
      rondas: numeroEn(t.rondas, d.torneo.rondas, LIMITES.rondas),
      minutos: numeroEn(t.minutos, d.torneo.minutos, LIMITES.minutos),
      extra: numeroEn(t.extra, d.torneo.extra, LIMITES.extra),
      inscripcion: numeroEn(t.inscripcion, d.torneo.inscripcion, LIMITES.inscripcion),
      cupo: numeroEn(t.cupo, d.torneo.cupo, LIMITES.cupo),
    },
    temporada: {
      nombre: texto(temp.nombre, d.temporada.nombre, 30),
      inicio: typeof temp.inicio === 'string' && FECHA.test(temp.inicio) ? temp.inicio : null,
    },
    reporteJugador: booleano(r.reporteJugador, d.reporteJugador),
    creditoPremio: booleano(r.creditoPremio, d.creditoPremio),
    descontarStock: booleano(r.descontarStock, d.descontarStock),
  };
}

/** Turno en curso según la hora; soporta turnos que cruzan la medianoche. */
export function turnoActual(turnos: readonly Turno[], ahora: Date = new Date()): Turno | null {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  for (const t of turnos) {
    const a = minutosDelDia(t.apertura);
    const c = minutosDelDia(t.cierre);
    if (a === null || c === null) continue;
    const dentro = a <= c ? min >= a && min < c : min >= a || min < c;
    if (dentro) return t;
  }
  return null;
}

/** Código de invitación legible (sin 0/O/1/I para dictarlo sin errores). */
export function generarCodigoInvitacion(bytes: Uint8Array): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += alfabeto[bytes[i % bytes.length] % alfabeto.length];
  return codigo;
}
