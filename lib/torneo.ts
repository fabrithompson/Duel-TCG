import { CONFIG_DEFAULT } from './config';

// Torneos.
//
// Colección `torneos/{id}` (ver interfaz Torneo). Subcolección
// `torneos/{id}/reportes/{ronda}_{mesa}_{uid}`: el resultado que reporta cada
// jugador desde su celular (si `config.reporteJugador`). El juez confirma;
// cuando los dos jugadores de una mesa reportan lo mismo, se aplica solo.
//
// Mesas de duelo del Salón: al emparejar, cada partida toma una mesa del
// Salón con `tipo: 'duelo'` (orden por número) y guarda `mesaSalonId`. El
// Salón pinta esa mesa como "duelo en curso" mientras la partida de la ronda
// actual no tenga resultado — no se escribe nada en `mesas`.
//
// Todo lo de este archivo es puro (sin Firebase ni fechas del sistema) para
// poder testearlo; el azar entra por un `rng` inyectable.

export type Juego = 'Pokémon TCG' | 'Magic' | 'Yu-Gi-Oh' | 'One Piece' | 'Otro';
export const JUEGOS: readonly Juego[] = ['Pokémon TCG', 'Magic', 'Yu-Gi-Oh', 'One Piece', 'Otro'];

export type FormatoId = 'suizo' | 'eliminacion' | 'suizo_top_cut' | 'casual';

export interface FormatoInfo {
  id: FormatoId;
  nombre: string;
  descripcion: string;
}

export const FORMATOS: readonly FormatoInfo[] = [
  { id: 'suizo', nombre: 'Suizo', descripcion: 'Todos juegan todas las rondas · el más usado' },
  { id: 'eliminacion', nombre: 'Eliminación directa', descripcion: 'Llave a partir de los inscriptos' },
  { id: 'suizo_top_cut', nombre: 'Suizo + top cut', descripcion: 'Rondas y después llave de los mejores' },
  { id: 'casual', nombre: 'Casual / mesa libre', descripcion: 'Sin puntaje · solo reloj y mesas' },
];

/** Tamaños de top cut ofrecidos al crear un torneo 'suizo_top_cut'. */
export const TOP_CUTS: readonly number[] = [4, 8];

/** Marcador de un mejor de 3, siempre desde la perspectiva del jugador1. */
export type Resultado = '2-0' | '2-1' | '1-2' | '0-2';
export const RESULTADOS: readonly Resultado[] = ['2-0', '2-1', '1-2', '0-2'];

export interface JugadorTorneo {
  uid: string;
  nombre: string;
  pagado: boolean;
}

export interface Partida {
  mesa: number;
  jugador1: JugadorTorneo;
  /** null = bye (jugador1 gana 2-0 automáticamente). */
  jugador2: JugadorTorneo | null;
  resultado: Resultado | null;
  /** Mesa física del Salón (tipo 'duelo') asignada a esta partida. */
  mesaSalonId?: string | null;
  mesaSalonNumero?: number | null;
}

export type FaseRonda = 'suizo' | 'eliminacion' | 'casual';

export interface Ronda {
  numero: number;
  /** 'eliminacion' en las rondas de llave (eliminación directa o top cut). */
  fase?: FaseRonda;
  partidas: Partida[];
}

export interface PuestoPremio {
  puesto: number;
  jugadorUid: string | null;
  productoId: string | null;
  /** Colección del producto del premio (por defecto 'tcg'). */
  productoOrigen?: 'productos' | 'tcg';
  /** Copia del nombre: el jugador no puede leer el catálogo, pero sí ver qué ganó. */
  productoNombre?: string | null;
  cantidadProducto: number;
  creditoCafeteria: number;
  entregado: boolean;
}

/** Posición final guardada al cerrar el torneo (Historial y Tabla la leen sin recalcular). */
export interface Posicion {
  uid: string;
  nombre: string;
  puesto: number;
  puntos: number;
  victorias: number;
  derrotas: number;
}

export interface Torneo {
  id: string;
  nombre: string;
  juego: Juego;
  formatoId: FormatoId;
  /** Nombre legible del formato (docs viejos solo tienen este campo). */
  formato: string;
  totalRondas: number;
  /** Tamaño del top cut en 'suizo_top_cut' (0 = sin corte). */
  topCut?: number;
  minutosPorRonda: number;
  minutosExtra: number;
  inscripcion: number;
  cupo: number;
  jugadores: JugadorTorneo[];
  /** Espejo de jugadores[].uid para reglas de seguridad y consultas array-contains. */
  jugadoresUids: string[];
  estado: 'en_curso' | 'finalizado';
  rondaActual: number;
  rondas: Ronda[];
  premios: PuestoPremio[];
  rondaFinEn: number | null;
  rondaRestanteMs: number | null;
  rondaPausada: boolean;
  /** YYYY-MM-DD local del día del torneo (para temporada e historial). */
  fecha: string;
  posiciones?: Posicion[];
  creadoPor?: string;
  creadoEn?: unknown;
  finalizadoEn?: unknown;
}

export interface Reporte {
  id: string;
  ronda: number;
  mesa: number;
  uid: string;
  /** Normalizado a la perspectiva del jugador1 de la partida. */
  resultado: Resultado;
  creadoEn?: unknown;
}

/** Mesa de duelo del Salón disponible para asignar a una partida. */
export interface MesaDuelo {
  id: string;
  numero: number;
}

export type Rng = () => number;

/** Invierte un marcador (perspectiva del otro jugador). */
export function invertirResultado(r: Resultado): Resultado {
  const mapa: Record<Resultado, Resultado> = { '2-0': '0-2', '2-1': '1-2', '1-2': '2-1', '0-2': '2-0' };
  return mapa[r];
}

export function idReporte(ronda: number, mesa: number, uid: string): string {
  return `${ronda}_${mesa}_${uid}`;
}

export function esResultado(valor: unknown): valor is Resultado {
  return typeof valor === 'string' && (RESULTADOS as readonly string[]).includes(valor);
}

export function ganaJugador1(r: Resultado): boolean {
  return r === '2-0' || r === '2-1';
}

function juegosDe(r: Resultado): [number, number] {
  return [Number(r[0]), Number(r[2])];
}

/** Ganador de la partida (el jugador1 en un bye); null si falta el resultado. */
export function ganadorDe(p: Partida): JugadorTorneo | null {
  if (p.jugador2 === null) return p.jugador1;
  if (p.resultado === null) return null;
  return ganaJugador1(p.resultado) ? p.jugador1 : p.jugador2;
}

export function perdedorDe(p: Partida): JugadorTorneo | null {
  if (p.jugador2 === null || p.resultado === null) return null;
  return ganaJugador1(p.resultado) ? p.jugador2 : p.jugador1;
}

/** Generador pseudoaleatorio con semilla (mulberry32), para emparejamientos reproducibles. */
export function crearRng(semilla: number): Rng {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mezclar<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function log2Techo(n: number): number {
  let k = 0;
  while (2 ** k < n) k++;
  return k;
}

function log2Piso(n: number): number {
  let k = 0;
  while (2 ** (k + 1) <= n) k++;
  return k;
}

/** Emparejamiento al azar de una lista (sin historial). Se mantiene por compatibilidad; los torneos usan generarRonda. */
export function emparejar(jugadores: readonly JugadorTorneo[], rng: Rng = Math.random): Partida[] {
  const mezclados = mezclar(jugadores, rng);
  const partidas: Partida[] = [];
  for (let i = 0; i < mezclados.length; i += 2) {
    const jugador2 = mezclados[i + 1] ?? null;
    partidas.push({
      mesa: partidas.length + 1,
      jugador1: mezclados[i],
      jugador2,
      resultado: jugador2 ? null : '2-0',
      mesaSalonId: null,
      mesaSalonNumero: null,
    });
  }
  return partidas;
}

export function rondaCompleta(ronda: Ronda): boolean {
  return ronda.partidas.every((p) => p.resultado !== null);
}

export function pendientesDe(ronda: Ronda | undefined): number {
  return ronda ? ronda.partidas.filter((p) => p.resultado === null).length : 0;
}

export function sugerirRondas(cantidadJugadores: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(cantidadJugadores, 2))));
}

// ---------------------------------------------------------------------------
// Formatos y fases
// ---------------------------------------------------------------------------

/** Top cut real según inscriptos: si hay menos jugadores que el corte, se achica a la potencia de 2 que entre. */
export function topCutEfectivo(cantidadJugadores: number, topCut: number): number {
  if (!Number.isFinite(topCut) || topCut < 2 || cantidadJugadores < 2) return 0;
  let k = 2 ** log2Piso(topCut);
  while (k > cantidadJugadores) k /= 2;
  return k >= 2 ? k : 0;
}

/** Rondas totales del torneo: en eliminación salen solas de los inscriptos; en top cut se suman las de la llave. */
export function totalRondasPara(formatoId: FormatoId, cantidadJugadores: number, rondasSuizas: number, topCut: number): number {
  if (formatoId === 'eliminacion') return Math.max(1, log2Techo(cantidadJugadores));
  if (formatoId === 'suizo_top_cut') {
    const k = topCutEfectivo(cantidadJugadores, topCut);
    return rondasSuizas + (k > 0 ? log2Piso(k) : 0);
  }
  return rondasSuizas;
}

type DatosFormato = Pick<Torneo, 'formatoId' | 'totalRondas' | 'topCut' | 'jugadores'>;

/** Cuántas rondas suizas tiene el torneo (0 en eliminación directa). */
export function rondasSuizasDe(t: DatosFormato): number {
  if (t.formatoId === 'eliminacion') return 0;
  if (t.formatoId !== 'suizo_top_cut') return t.totalRondas;
  const k = topCutEfectivo(t.jugadores.length, t.topCut ?? 0);
  return Math.max(0, t.totalRondas - (k > 0 ? log2Piso(k) : 0));
}

export function faseParaRonda(t: DatosFormato, numero: number): FaseRonda {
  if (t.formatoId === 'casual') return 'casual';
  if (t.formatoId === 'eliminacion') return 'eliminacion';
  if (t.formatoId === 'suizo') return 'suizo';
  return numero <= rondasSuizasDe(t) ? 'suizo' : 'eliminacion';
}

function faseDe(r: Ronda): FaseRonda {
  return r.fase ?? 'suizo';
}

function nombreFaseLlave(jugadoresEnLlave: number): string | null {
  if (jugadoresEnLlave <= 2) return 'Final';
  if (jugadoresEnLlave === 4) return 'Semifinal';
  if (jugadoresEnLlave === 8) return 'Cuartos de final';
  if (jugadoresEnLlave === 16) return 'Octavos de final';
  return null;
}

/** Título de la ronda: "Ronda 3 de 5", "Top 4 · Semifinal", "Final". */
export function nombreRonda(t: DatosFormato, ronda: Ronda | undefined): string {
  if (!ronda) return 'Ronda';
  const generico = `Ronda ${ronda.numero} de ${t.totalRondas}`;
  if (faseDe(ronda) !== 'eliminacion') return generico;
  const enLlave = ronda.partidas.length * 2;
  const fase = nombreFaseLlave(enLlave);
  if (!fase) return generico;
  if (fase === 'Final' || t.formatoId !== 'suizo_top_cut') return fase;
  return `Top ${enLlave} · ${fase}`;
}

/** La ronda en juego es la última: se cierra el torneo en vez de emparejar otra. */
export function esUltimaRonda(t: DatosFormato & Pick<Torneo, 'rondaActual' | 'rondas'>): boolean {
  if (t.rondaActual >= t.totalRondas) return true;
  const ronda = t.rondas.find((r) => r.numero === t.rondaActual);
  return !!ronda && faseDe(ronda) === 'eliminacion' && ronda.partidas.length <= 1;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface Standing {
  jugador: JugadorTorneo;
  victorias: number;
  derrotas: number;
  /** 3 por victoria (el bye cuenta como victoria). */
  puntos: number;
  /** Opponent match win %: promedio del % de victorias de sus rivales (cada uno con piso 0.33). */
  omw: number;
  /** Game win %: juegos ganados sobre juegos jugados. */
  gw: number;
}

const PISO_MW = 0.33;
const EPSILON = 1e-9;

interface Acumulado {
  jugador: JugadorTorneo;
  victorias: number;
  derrotas: number;
  puntos: number;
  partidas: number;
  juegosGanados: number;
  juegosJugados: number;
  rivales: string[];
  byes: number;
}

function acumular(torneo: Pick<Torneo, 'jugadores' | 'rondas'>, fases?: readonly FaseRonda[]): Map<string, Acumulado> {
  const stats = new Map<string, Acumulado>();
  torneo.jugadores.forEach((j) =>
    stats.set(j.uid, { jugador: j, victorias: 0, derrotas: 0, puntos: 0, partidas: 0, juegosGanados: 0, juegosJugados: 0, rivales: [], byes: 0 })
  );

  torneo.rondas.forEach((ronda) => {
    if (fases && !fases.includes(faseDe(ronda))) return;
    ronda.partidas.forEach((p) => {
      if (!p.resultado) return;
      const a = stats.get(p.jugador1.uid);
      if (!p.jugador2) {
        if (!a) return;
        a.victorias += 1;
        a.puntos += 3;
        a.partidas += 1;
        a.byes += 1;
        a.juegosGanados += 2;
        a.juegosJugados += 2;
        return;
      }
      const b = stats.get(p.jugador2.uid);
      const [ga, gb] = juegosDe(p.resultado);
      const ganaA = ga > gb;
      if (a) {
        a.partidas += 1;
        a.juegosGanados += ga;
        a.juegosJugados += ga + gb;
        a.rivales.push(p.jugador2.uid);
        if (ganaA) {
          a.victorias += 1;
          a.puntos += 3;
        } else {
          a.derrotas += 1;
        }
      }
      if (b) {
        b.partidas += 1;
        b.juegosGanados += gb;
        b.juegosJugados += ga + gb;
        b.rivales.push(p.jugador1.uid);
        if (ganaA) {
          b.derrotas += 1;
        } else {
          b.victorias += 1;
          b.puntos += 3;
        }
      }
    });
  });
  return stats;
}

function compararStandings(a: Standing, b: Standing): number {
  if (a.puntos !== b.puntos) return b.puntos - a.puntos;
  if (Math.abs(a.omw - b.omw) > EPSILON) return b.omw - a.omw;
  if (Math.abs(a.gw - b.gw) > EPSILON) return b.gw - a.gw;
  return a.jugador.nombre.localeCompare(b.jugador.nombre, 'es') || a.jugador.uid.localeCompare(b.jugador.uid);
}

/**
 * Tabla ordenada por puntos, OMW, GW y nombre. Solo cuenta partidas con
 * resultado. `fases` limita qué rondas suman (p. ej. solo las suizas para
 * sembrar un top cut).
 */
export function calcularStandings(torneo: Pick<Torneo, 'jugadores' | 'rondas'>, fases?: readonly FaseRonda[]): Standing[] {
  const stats = acumular(torneo, fases);
  const mw = (uid: string): number => {
    const s = stats.get(uid);
    if (!s || s.partidas === 0) return PISO_MW;
    return Math.max(PISO_MW, s.puntos / (3 * s.partidas));
  };
  const standings: Standing[] = [...stats.values()].map((s) => ({
    jugador: s.jugador,
    victorias: s.victorias,
    derrotas: s.derrotas,
    puntos: s.puntos,
    omw: s.rivales.length === 0 ? 0 : s.rivales.reduce((acc, uid) => acc + mw(uid), 0) / s.rivales.length,
    gw: s.juegosJugados === 0 ? 0 : s.juegosGanados / s.juegosJugados,
  }));
  return standings.sort(compararStandings);
}

/** "3-1": victorias-derrotas. */
export function recordDe(s: Pick<Standing, 'victorias' | 'derrotas'> | undefined): string {
  return s ? `${s.victorias}-${s.derrotas}` : '0-0';
}

// ---------------------------------------------------------------------------
// Emparejamiento
// ---------------------------------------------------------------------------

type Par = [number, number];

const PRESUPUESTO_ESTRICTO = 60_000;
const PRESUPUESTO_COSTO = 30_000;
const COSTO_REVANCHA = 1000;

/**
 * Busca pares sin revancha respetando el orden (cada jugador enfrenta al más
 * cercano posible en la tabla, así el que sobra de un grupo de puntos "flota"
 * al siguiente). Backtracking con presupuesto de nodos; null si no hay forma.
 */
function paresSinRevancha(n: number, jugaron: (i: number, j: number) => boolean, presupuesto: { nodos: number }): Par[] | null {
  const usado = new Array<boolean>(n).fill(false);
  const pares: Par[] = [];
  const buscar = (): boolean => {
    presupuesto.nodos -= 1;
    if (presupuesto.nodos < 0) return false;
    const i = usado.indexOf(false);
    if (i === -1) return true;
    usado[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (usado[j] || jugaron(i, j)) continue;
      usado[j] = true;
      pares.push([i, j]);
      if (buscar()) return true;
      pares.pop();
      usado[j] = false;
      if (presupuesto.nodos < 0) break;
    }
    usado[i] = false;
    return false;
  };
  return buscar() ? pares : null;
}

/** Pares de costo total mínimo (revanchas y saltos de puntos cuestan): arranca goloso y mejora con ramificación y poda. */
function paresMinimoCosto(n: number, costo: number[][]): Par[] {
  const usado = new Array<boolean>(n).fill(false);
  const goloso: Par[] = [];
  for (let i = 0; i < n; i++) {
    if (usado[i]) continue;
    usado[i] = true;
    let mejorJ = -1;
    for (let j = i + 1; j < n; j++) {
      if (!usado[j] && (mejorJ === -1 || costo[i][j] < costo[i][mejorJ])) mejorJ = j;
    }
    if (mejorJ === -1) break;
    usado[mejorJ] = true;
    goloso.push([i, mejorJ]);
  }
  let mejor = goloso;
  let mejorCosto = goloso.reduce((acc, [i, j]) => acc + costo[i][j], 0);

  usado.fill(false);
  const actual: Par[] = [];
  let nodos = 0;
  const buscar = (acumulado: number): void => {
    nodos += 1;
    if (nodos > PRESUPUESTO_COSTO || acumulado >= mejorCosto) return;
    const i = usado.indexOf(false);
    if (i === -1) {
      mejorCosto = acumulado;
      mejor = [...actual];
      return;
    }
    usado[i] = true;
    const candidatos: number[] = [];
    for (let j = i + 1; j < n; j++) if (!usado[j]) candidatos.push(j);
    candidatos.sort((a, b) => costo[i][a] - costo[i][b] || a - b);
    for (const j of candidatos) {
      usado[j] = true;
      actual.push([i, j]);
      buscar(acumulado + costo[i][j]);
      actual.pop();
      usado[j] = false;
      if (nodos > PRESUPUESTO_COSTO) break;
    }
    usado[i] = false;
  };
  buscar(0);
  return mejor;
}

function clavePar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Historial {
  cruces: Map<string, number>;
  byes: Map<string, number>;
}

function historialDe(rondas: readonly Ronda[]): Historial {
  const cruces = new Map<string, number>();
  const byes = new Map<string, number>();
  rondas.forEach((r) =>
    r.partidas.forEach((p) => {
      if (p.jugador2) {
        const k = clavePar(p.jugador1.uid, p.jugador2.uid);
        cruces.set(k, (cruces.get(k) ?? 0) + 1);
      } else {
        byes.set(p.jugador1.uid, (byes.get(p.jugador1.uid) ?? 0) + 1);
      }
    })
  );
  return { cruces, byes };
}

type PartidaSinMesa = Pick<Partida, 'jugador1' | 'jugador2'>;

function partidasSuizas(jugadores: readonly JugadorTorneo[], previas: readonly Ronda[], rng: Rng): PartidaSinMesa[] {
  const standings = calcularStandings({ jugadores: [...jugadores], rondas: [...previas] }, ['suizo']);
  const orden: Standing[] = [];
  for (let i = 0; i < standings.length; ) {
    let fin = i;
    while (fin < standings.length && standings[fin].puntos === standings[i].puntos) fin++;
    orden.push(...mezclar(standings.slice(i, fin), rng));
    i = fin;
  }
  const { cruces, byes } = historialDe(previas);
  const cantidadCruces = (a: Standing, b: Standing) => cruces.get(clavePar(a.jugador.uid, b.jugador.uid)) ?? 0;

  const armar = (lista: Standing[], pares: Par[]): PartidaSinMesa[] =>
    pares.map(([i, j]) => ({ jugador1: lista[i].jugador, jugador2: lista[j].jugador }));

  const resolver = (lista: Standing[], presupuesto: { nodos: number }): PartidaSinMesa[] | null => {
    const pares = paresSinRevancha(lista.length, (i, j) => cantidadCruces(lista[i], lista[j]) > 0, presupuesto);
    return pares ? armar(lista, pares) : null;
  };

  const conCosto = (lista: Standing[]): PartidaSinMesa[] => {
    const costo = lista.map((a) =>
      lista.map((b) => cantidadCruces(a, b) * COSTO_REVANCHA + ((a.puntos - b.puntos) / 3) ** 2)
    );
    return armar(lista, paresMinimoCosto(lista.length, costo));
  };

  const presupuesto = { nodos: PRESUPUESTO_ESTRICTO };
  if (orden.length % 2 === 0) return resolver(orden, presupuesto) ?? conCosto(orden);

  const byesDe = (s: Standing) => byes.get(s.jugador.uid) ?? 0;
  const minimo = Math.min(...orden.map(byesDe));
  const candidatos = [...orden]
    .reverse()
    .filter((s) => byesDe(s) === minimo)
    .sort((a, b) => a.puntos - b.puntos);

  for (const candidato of candidatos) {
    if (presupuesto.nodos < 0) break;
    const resto = orden.filter((s) => s !== candidato);
    const partidas = resolver(resto, presupuesto);
    if (partidas) return [...partidas, { jugador1: candidato.jugador, jugador2: null }];
  }
  const elegido = candidatos[0];
  return [...conCosto(orden.filter((s) => s !== elegido)), { jugador1: elegido.jugador, jugador2: null }];
}

function partidasCasuales(jugadores: readonly JugadorTorneo[], previas: readonly Ronda[], rng: Rng): PartidaSinMesa[] {
  const mezclados = mezclar(jugadores, rng);
  const partidas: PartidaSinMesa[] = [];
  let bye: JugadorTorneo | null = null;
  if (mezclados.length % 2 === 1) {
    const { byes } = historialDe(previas);
    const minimo = Math.min(...mezclados.map((j) => byes.get(j.uid) ?? 0));
    const candidatos = mezclados.filter((j) => (byes.get(j.uid) ?? 0) === minimo);
    bye = candidatos[candidatos.length - 1];
  }
  const resto = mezclados.filter((j) => j !== bye);
  for (let i = 0; i + 1 < resto.length; i += 2) partidas.push({ jugador1: resto[i], jugador2: resto[i + 1] });
  if (bye) partidas.push({ jugador1: bye, jugador2: null });
  return partidas;
}

/** Orden de siembra de una llave de tamaño `b`: 1-8, 4-5, 2-7, 3-6 (el 1 y el 2 solo se cruzan en la final). */
export function ordenLlave(b: number): number[] {
  let orden = [1];
  while (orden.length < b) {
    const suma = orden.length * 2 + 1;
    orden = orden.flatMap((s) => [s, suma - s]);
  }
  return orden;
}

/** Primera ronda de llave: los mejores sembrados reciben los byes si la cantidad no es potencia de 2. */
function partidasLlaveDesdeSemillas(semillas: readonly JugadorTorneo[]): PartidaSinMesa[] {
  const b = 2 ** Math.max(1, log2Techo(semillas.length));
  const orden = ordenLlave(b);
  const partidas: PartidaSinMesa[] = [];
  for (let i = 0; i < orden.length; i += 2) {
    const a: JugadorTorneo | undefined = semillas[orden[i] - 1];
    const c: JugadorTorneo | undefined = semillas[orden[i + 1] - 1];
    const unico = a ?? c;
    if (a && c) partidas.push({ jugador1: a, jugador2: c });
    else if (unico) partidas.push({ jugador1: unico, jugador2: null });
  }
  return partidas;
}

/** Siguiente ronda de llave: ganadores de partidas consecutivas, en el orden de la llave. */
function partidasLlaveSiguiente(anterior: Ronda): PartidaSinMesa[] {
  const ganadores = anterior.partidas.map((p) => {
    const g = ganadorDe(p);
    if (!g) throw new Error(`La ronda ${anterior.numero} tiene partidas sin resultado.`);
    return g;
  });
  const partidas: PartidaSinMesa[] = [];
  for (let i = 0; i < ganadores.length; i += 2) {
    partidas.push({ jugador1: ganadores[i], jugador2: ganadores[i + 1] ?? null });
  }
  return partidas;
}

/** Numera las partidas (primero las que se juegan, los byes al final) y les asigna mesas de duelo del Salón en orden. */
function numerarYAsignarMesas(partidas: readonly PartidaSinMesa[], mesasDuelo: readonly MesaDuelo[]): Partida[] {
  const mesas = [...mesasDuelo].sort((a, b) => a.numero - b.numero);
  const reales = partidas.filter((p) => p.jugador2 !== null).length;
  let jugadas = 0;
  let byes = 0;
  return partidas.map((p) => {
    if (p.jugador2 === null) {
      byes += 1;
      return { mesa: reales + byes, jugador1: p.jugador1, jugador2: null, resultado: '2-0', mesaSalonId: null, mesaSalonNumero: null };
    }
    const mesa = mesas[jugadas];
    jugadas += 1;
    return {
      mesa: jugadas,
      jugador1: p.jugador1,
      jugador2: p.jugador2,
      resultado: null,
      mesaSalonId: mesa?.id ?? null,
      mesaSalonNumero: mesa?.numero ?? null,
    };
  });
}

/**
 * Arma la ronda `numero` a partir de lo jugado en las anteriores.
 *  - Suizo: por puntos, sin revanchas (si es imposible, la de menor costo);
 *    bye al de menos puntos que todavía no tuvo.
 *  - Eliminación: ronda 1 por orden de inscripción; después, ganadores en orden de llave.
 *  - Suizo + top cut: suizo y después llave con los `topCut` mejores del suizo.
 *  - Casual: al azar.
 */
export function generarRonda(
  torneo: Pick<Torneo, 'jugadores' | 'rondas' | 'formatoId' | 'totalRondas' | 'topCut'>,
  numero: number,
  mesasDuelo: readonly MesaDuelo[],
  rng: Rng = Math.random
): Ronda {
  if (torneo.jugadores.length < 2) throw new Error('Hacen falta al menos 2 jugadores para emparejar.');
  const previas = torneo.rondas.filter((r) => r.numero < numero).sort((a, b) => a.numero - b.numero);
  const fase = faseParaRonda(torneo, numero);

  let partidas: PartidaSinMesa[];
  if (fase === 'casual') {
    partidas = partidasCasuales(torneo.jugadores, previas, rng);
  } else if (fase === 'suizo') {
    partidas = partidasSuizas(torneo.jugadores, previas, rng);
  } else {
    const anterior = previas[previas.length - 1];
    if (anterior && faseDe(anterior) === 'eliminacion') {
      partidas = partidasLlaveSiguiente(anterior);
    } else if (torneo.formatoId === 'suizo_top_cut') {
      const k = topCutEfectivo(torneo.jugadores.length, torneo.topCut ?? 0);
      const semillas = calcularStandings({ jugadores: torneo.jugadores, rondas: previas }, ['suizo'])
        .slice(0, Math.max(2, k))
        .map((s) => s.jugador);
      partidas = partidasLlaveDesdeSemillas(semillas);
    } else {
      partidas = partidasLlaveDesdeSemillas(torneo.jugadores);
    }
  }
  return { numero, fase, partidas: numerarYAsignarMesas(partidas, mesasDuelo) };
}

// ---------------------------------------------------------------------------
// Cierre y premios
// ---------------------------------------------------------------------------

/**
 * Posiciones finales. En llave: campeón 1°, finalista 2°, y después por
 * ronda en la que quedó afuera (desempatando por la tabla suiza en top cut o
 * la general en eliminación directa); los que no entraron al top cut siguen
 * por la tabla suiza. En suizo y casual, la tabla general. Casual no suma
 * puntos para la tabla de la temporada.
 */
export function posicionesFinales(torneo: Pick<Torneo, 'jugadores' | 'rondas' | 'formatoId'>): Posicion[] {
  const general = calcularStandings(torneo);
  const porUid = new Map(general.map((s) => [s.jugador.uid, s]));
  const rondasLlave = torneo.rondas.filter((r) => faseDe(r) === 'eliminacion').sort((a, b) => a.numero - b.numero);

  let orden: JugadorTorneo[] = general.map((s) => s.jugador);
  if (rondasLlave.length > 0 && torneo.formatoId !== 'suizo' && torneo.formatoId !== 'casual') {
    const base = torneo.formatoId === 'suizo_top_cut' ? calcularStandings(torneo, ['suizo']) : general;
    const indice = new Map(base.map((s, i) => [s.jugador.uid, i]));
    const enLlave = new Set<string>();
    const eliminadoEn = new Map<string, number>();
    rondasLlave.forEach((r) =>
      r.partidas.forEach((p) => {
        enLlave.add(p.jugador1.uid);
        if (p.jugador2) enLlave.add(p.jugador2.uid);
        const perdedor = perdedorDe(p);
        if (perdedor) eliminadoEn.set(perdedor.uid, r.numero);
      })
    );
    const nivel = (uid: string): number => {
      if (!enLlave.has(uid)) return -1;
      return eliminadoEn.get(uid) ?? Number.MAX_SAFE_INTEGER;
    };
    orden = base
      .map((s) => s.jugador)
      .sort((a, b) => nivel(b.uid) - nivel(a.uid) || (indice.get(a.uid) ?? 0) - (indice.get(b.uid) ?? 0));
  }

  return orden.map((j, i) => {
    const s = porUid.get(j.uid);
    return {
      uid: j.uid,
      nombre: j.nombre,
      puesto: i + 1,
      puntos: torneo.formatoId === 'casual' ? 0 : s?.puntos ?? 0,
      victorias: s?.victorias ?? 0,
      derrotas: s?.derrotas ?? 0,
    };
  });
}

/** Asigna el ganador de cada puesto premiado; los ya entregados no se tocan. */
export function asignarPremios(premios: readonly PuestoPremio[], posiciones: readonly Posicion[]): PuestoPremio[] {
  return premios.map((p) => {
    if (p.entregado) return p;
    const pos = posiciones.find((x) => x.puesto === p.puesto);
    return { ...p, jugadorUid: pos?.uid ?? null };
  });
}

export function pozoDe(t: Pick<Torneo, 'jugadores' | 'inscripcion'>): number {
  return t.jugadores.length * t.inscripcion;
}

/** Mesas del Salón con duelo en curso: partidas sin resultado de la ronda actual de un torneo en curso. */
export function mesasSalonEnDuelo(t: Pick<Torneo, 'estado' | 'rondaActual' | 'rondas'> | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!t || t.estado !== 'en_curso') return ids;
  const ronda = t.rondas.find((r) => r.numero === t.rondaActual);
  ronda?.partidas.forEach((p) => {
    if (p.resultado === null && p.mesaSalonId) ids.add(p.mesaSalonId);
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Reportes de jugadores
// ---------------------------------------------------------------------------

export interface ReportesPartida {
  jugador1: Reporte | null;
  jugador2: Reporte | null;
}

/** Reportes de los dos jugadores de una partida (se asume que `reportes` son de la misma ronda). */
export function reportesDePartida(partida: Partida, reportes: readonly Reporte[]): ReportesPartida {
  const de = (uid: string | undefined) =>
    uid ? reportes.find((r) => r.mesa === partida.mesa && r.uid === uid) ?? null : null;
  return { jugador1: de(partida.jugador1.uid), jugador2: de(partida.jugador2?.uid) };
}

/** El resultado si los dos jugadores reportaron lo mismo; si no, null. */
export function aplicarReportes(partida: Partida, reportes: readonly Reporte[]): Resultado | null {
  if (!partida.jugador2) return null;
  const { jugador1, jugador2 } = reportesDePartida(partida, reportes);
  if (!jugador1 || !jugador2) return null;
  return jugador1.resultado === jugador2.resultado ? jugador1.resultado : null;
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

type CamposTimer = Pick<Torneo, 'rondaPausada' | 'rondaRestanteMs' | 'rondaFinEn'>;

/**
 * Segundos que le quedan a la ronda. El timer vive en Firestore como un
 * timestamp de fin (o el restante si está pausado), así sobrevive a que el
 * juez cierre la app y todos los celulares ven lo mismo.
 */
export function segundosRestantes(t: CamposTimer, ahoraMs: number): number {
  if (t.rondaPausada) return Math.max(0, Math.round((t.rondaRestanteMs ?? 0) / 1000));
  if (!t.rondaFinEn) return 0;
  return Math.max(0, Math.round((t.rondaFinEn - ahoraMs) / 1000));
}

export function formatTimer(segundosTotales: number): string {
  const s = Math.max(0, Math.round(segundosTotales));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export type EstadoTimer = 'corriendo' | 'pausado' | 'extra';

export function estadoTimer(t: CamposTimer, ahoraMs: number): EstadoTimer {
  if (t.rondaPausada) return 'pausado';
  return segundosRestantes(t, ahoraMs) === 0 ? 'extra' : 'corriendo';
}

export function timerNuevaRonda(minutos: number, ahoraMs: number): CamposTimer {
  return { rondaFinEn: ahoraMs + minutos * 60_000, rondaRestanteMs: null, rondaPausada: false };
}

export function timerPausado(t: CamposTimer, ahoraMs: number): CamposTimer {
  if (t.rondaPausada) return { rondaPausada: true, rondaRestanteMs: t.rondaRestanteMs ?? 0, rondaFinEn: null };
  return { rondaPausada: true, rondaRestanteMs: Math.max(0, (t.rondaFinEn ?? ahoraMs) - ahoraMs), rondaFinEn: null };
}

export function timerReanudado(t: CamposTimer, ahoraMs: number): CamposTimer {
  if (!t.rondaPausada) return { rondaPausada: false, rondaRestanteMs: null, rondaFinEn: t.rondaFinEn };
  return { rondaPausada: false, rondaRestanteMs: null, rondaFinEn: ahoraMs + Math.max(0, t.rondaRestanteMs ?? 0) };
}

/** Suma minutos al reloj; si ya estaba en 0, cuentan desde ahora (sumarlos a un fin vencido no serviría). */
export function timerConExtra(t: CamposTimer, minutos: number, ahoraMs: number): CamposTimer {
  const extraMs = minutos * 60_000;
  if (t.rondaPausada) return { rondaPausada: true, rondaRestanteMs: Math.max(0, t.rondaRestanteMs ?? 0) + extraMs, rondaFinEn: null };
  return { rondaPausada: false, rondaRestanteMs: null, rondaFinEn: Math.max(t.rondaFinEn ?? ahoraMs, ahoraMs) + extraMs };
}

// ---------------------------------------------------------------------------
// Normalización de documentos
// ---------------------------------------------------------------------------

type Datos = Record<string, unknown>;

function esObjeto(v: unknown): v is Datos {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function numeroValido(v: unknown, fallback: number, min = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : fallback;
}

function enteroValido(v: unknown, fallback: number, min = 0): number {
  return Math.round(numeroValido(v, fallback, min));
}

function textoValido(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function juegoDe(v: unknown): Juego {
  if (typeof v !== 'string') return 'Otro';
  const t = v.toLowerCase();
  if (t.includes('pok')) return 'Pokémon TCG';
  if (t.includes('magic')) return 'Magic';
  if (t.includes('yu')) return 'Yu-Gi-Oh';
  if (t.includes('one piece')) return 'One Piece';
  return 'Otro';
}

function formatoIdDe(formatoId: unknown, formato: unknown): FormatoId {
  if (typeof formatoId === 'string' && FORMATOS.some((f) => f.id === formatoId)) return formatoId as FormatoId;
  const t = typeof formato === 'string' ? formato.toLowerCase() : '';
  if (t.includes('top')) return 'suizo_top_cut';
  if (t.includes('elimin')) return 'eliminacion';
  if (t.includes('casual') || t.includes('libre')) return 'casual';
  return 'suizo';
}

/** Docs muy viejos guardaban a los jugadores como texto (el nombre). */
function jugadorDe(v: unknown): JugadorTorneo | null {
  if (typeof v === 'string' && v.trim()) return { uid: v, nombre: v, pagado: false };
  if (!esObjeto(v)) return null;
  const uid = typeof v.uid === 'string' && v.uid ? v.uid : typeof v.nombre === 'string' ? v.nombre : '';
  if (!uid) return null;
  return { uid, nombre: textoValido(v.nombre, 'Jugador'), pagado: v.pagado === true };
}

function resultadoDe(p: Datos, j1: JugadorTorneo, j2: JugadorTorneo | null): Resultado | null {
  if (!j2) return '2-0';
  if (esResultado(p.resultado)) return p.resultado;
  if (typeof p.ganador === 'string' && p.ganador) {
    if (p.ganador === j1.uid || p.ganador === j1.nombre) return '2-0';
    if (p.ganador === j2.uid || p.ganador === j2.nombre) return '0-2';
  }
  return null;
}

function partidaDe(v: unknown, indice: number): Partida | null {
  if (!esObjeto(v)) return null;
  const jugador1 = jugadorDe(v.jugador1);
  if (!jugador1) return null;
  const jugador2 = v.jugador2 === null || v.jugador2 === undefined ? null : jugadorDe(v.jugador2);
  return {
    mesa: enteroValido(v.mesa, indice + 1, 1),
    jugador1,
    jugador2,
    resultado: resultadoDe(v, jugador1, jugador2),
    mesaSalonId: typeof v.mesaSalonId === 'string' && v.mesaSalonId ? v.mesaSalonId : null,
    mesaSalonNumero: typeof v.mesaSalonNumero === 'number' && Number.isFinite(v.mesaSalonNumero) ? v.mesaSalonNumero : null,
  };
}

function premioDe(v: unknown, indice: number): PuestoPremio | null {
  if (!esObjeto(v)) return null;
  return {
    puesto: enteroValido(v.puesto, indice + 1, 1),
    jugadorUid: typeof v.jugadorUid === 'string' && v.jugadorUid ? v.jugadorUid : null,
    productoId: typeof v.productoId === 'string' && v.productoId ? v.productoId : null,
    productoOrigen: v.productoOrigen === 'productos' ? 'productos' : 'tcg',
    productoNombre: typeof v.productoNombre === 'string' && v.productoNombre ? v.productoNombre.slice(0, 60) : null,
    cantidadProducto: enteroValido(v.cantidadProducto ?? v.sobres, 0),
    creditoCafeteria: enteroValido(v.creditoCafeteria, 0),
    entregado: v.entregado === true,
  };
}

function posicionDe(v: unknown): Posicion | null {
  if (!esObjeto(v) || typeof v.uid !== 'string') return null;
  return {
    uid: v.uid,
    nombre: textoValido(v.nombre, 'Jugador'),
    puesto: enteroValido(v.puesto, 0),
    puntos: numeroValido(v.puntos, 0),
    victorias: enteroValido(v.victorias, 0),
    derrotas: enteroValido(v.derrotas, 0),
  };
}

function soloValidos<T>(lista: unknown, mapear: (v: unknown, i: number) => T | null): T[] {
  if (!Array.isArray(lista)) return [];
  return lista.map(mapear).filter((x): x is T => x !== null);
}

/**
 * Convierte un doc de `torneos` en un Torneo completo. Tolera docs viejos:
 * sin formatoId (se deriva del texto del formato), sin jugadoresUids, sin
 * fecha, sin fase en las rondas y partidas sin mesa del Salón.
 */
export function normalizarTorneo(id: string, data: Datos): Torneo {
  const d = CONFIG_DEFAULT.torneo;
  const formatoId = formatoIdDe(data.formatoId, data.formato);
  const jugadores = soloValidos(data.jugadores, jugadorDe);
  const rondasCrudas = soloValidos(data.rondas, (v, i) =>
    esObjeto(v)
      ? { numero: enteroValido(v.numero, i + 1, 1), fase: v.fase, partidas: soloValidos(v.partidas, partidaDe) }
      : null
  );
  const totalRondas = enteroValido(data.totalRondas, Math.max(1, rondasCrudas.length), 1);
  const topCut = enteroValido(data.topCut, 0);
  const datosFormato: DatosFormato = { formatoId, totalRondas, topCut, jugadores };
  const rondas: Ronda[] = rondasCrudas.map((r) => ({
    numero: r.numero,
    fase: r.fase === 'suizo' || r.fase === 'eliminacion' || r.fase === 'casual' ? r.fase : faseParaRonda(datosFormato, r.numero),
    partidas: r.partidas,
  }));
  const uids = Array.isArray(data.jugadoresUids)
    ? data.jugadoresUids.filter((u): u is string => typeof u === 'string')
    : jugadores.map((j) => j.uid);

  return {
    id,
    nombre: textoValido(data.nombre, 'Torneo'),
    juego: juegoDe(data.juego),
    formatoId,
    formato: textoValido(data.formato, FORMATOS.find((f) => f.id === formatoId)?.nombre ?? 'Suizo'),
    totalRondas,
    topCut,
    minutosPorRonda: enteroValido(data.minutosPorRonda, d.minutos, 1),
    minutosExtra: enteroValido(data.minutosExtra, d.extra),
    inscripcion: numeroValido(data.inscripcion, d.inscripcion),
    cupo: enteroValido(data.cupo, Math.max(d.cupo, jugadores.length)),
    jugadores,
    jugadoresUids: uids,
    estado: data.estado === 'finalizado' ? 'finalizado' : 'en_curso',
    rondaActual: enteroValido(data.rondaActual, Math.max(1, rondas.length), 1),
    rondas,
    premios: soloValidos(data.premios, premioDe).sort((a, b) => a.puesto - b.puesto),
    rondaFinEn: typeof data.rondaFinEn === 'number' && Number.isFinite(data.rondaFinEn) ? data.rondaFinEn : null,
    rondaRestanteMs: typeof data.rondaRestanteMs === 'number' && Number.isFinite(data.rondaRestanteMs) ? data.rondaRestanteMs : null,
    rondaPausada: data.rondaPausada === true,
    fecha: typeof data.fecha === 'string' ? data.fecha : '',
    posiciones: Array.isArray(data.posiciones) ? soloValidos(data.posiciones, posicionDe) : undefined,
    creadoPor: typeof data.creadoPor === 'string' ? data.creadoPor : undefined,
    creadoEn: data.creadoEn,
    finalizadoEn: data.finalizadoEn,
  };
}
