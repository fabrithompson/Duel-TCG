import { formatARS } from './pedido';
import {
  calcularStandings,
  estadoTimer,
  ganaJugador1,
  invertirResultado,
  segundosRestantes,
  type JugadorTorneo,
  type Partida,
  type Posicion,
  type PuestoPremio,
  type Resultado,
  type Ronda,
  type Torneo,
} from './torneo';

// Lógica pura de las pantallas del jugador: Tabla (temporada), Historial y Mi duelo.

/** Segundos por debajo de los cuales el reloj pasa a rojo (diseño: `secs < 300`). */
export const SEGUNDOS_RELOJ_BAJO = 300;

function numeroFinito(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Posiciones con uid válido y sin repetidos (puesto 0 = desconocido). La tabla
 * no confía en que `posiciones` venga normalizado: un repetido sumaría dos veces.
 */
export function posicionesValidas(raw: unknown): Posicion[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const salida: Posicion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.uid !== 'string' || !p.uid || vistos.has(p.uid)) continue;
    vistos.add(p.uid);
    salida.push({
      uid: p.uid,
      nombre: typeof p.nombre === 'string' && p.nombre.trim() ? p.nombre.trim() : 'Jugador',
      puesto: typeof p.puesto === 'number' && Number.isInteger(p.puesto) && p.puesto >= 1 ? p.puesto : 0,
      puntos: numeroFinito(p.puntos),
      victorias: Math.max(0, numeroFinito(p.victorias)),
      derrotas: Math.max(0, numeroFinito(p.derrotas)),
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Tabla de la temporada
// ---------------------------------------------------------------------------

export interface FilaTemporada {
  uid: string;
  nombre: string;
  puntos: number;
  victorias: number;
  derrotas: number;
  torneos: number;
  /** Mejor puesto final en la temporada; null si ningún torneo lo registró. */
  mejorPuesto: number | null;
  /** Puesto en la tabla; empatados en puntos y victorias comparten número. */
  posicion: number;
}

/** `formatoId` es opcional: sin él, el torneo cuenta. */
export type TorneoTemporada = Pick<Torneo, 'posiciones' | 'fecha'> & Partial<Pick<Torneo, 'formatoId'>>;

/**
 * Torneos que cuentan para la temporada: fecha >= inicio (todos si no hay inicio),
 * sin los casuales, que no tienen puntaje.
 */
export function torneosDeTemporada<T extends TorneoTemporada>(torneos: readonly T[], inicio: string | null): T[] {
  return torneos.filter((t) => {
    if (t.formatoId === 'casual') return false;
    if (!inicio) return true;
    return typeof t.fecha === 'string' && t.fecha !== '' && t.fecha >= inicio;
  });
}

/** Fechas jugadas de la temporada: torneos que cuentan y dejaron al menos una posición. */
export function fechasDeTemporada(torneos: readonly TorneoTemporada[], inicio: string | null): number {
  return torneosDeTemporada(torneos, inicio).filter((t) => posicionesValidas(t.posiciones).length > 0).length;
}

function compararFilas(a: Omit<FilaTemporada, 'posicion'>, b: Omit<FilaTemporada, 'posicion'>): number {
  return (
    b.puntos - a.puntos ||
    b.victorias - a.victorias ||
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) ||
    (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  );
}

export function calcularTablaTemporada(torneos: readonly TorneoTemporada[], inicio: string | null): FilaTemporada[] {
  const acumulado = new Map<string, Omit<FilaTemporada, 'posicion'>>();
  const fechaDelNombre = new Map<string, string>();

  for (const torneo of torneosDeTemporada(torneos, inicio)) {
    const fecha = typeof torneo.fecha === 'string' ? torneo.fecha : '';
    for (const p of posicionesValidas(torneo.posiciones)) {
      const puesto = p.puesto > 0 ? p.puesto : null;
      const previo = acumulado.get(p.uid);
      if (!previo) {
        acumulado.set(p.uid, {
          uid: p.uid,
          nombre: p.nombre,
          puntos: p.puntos,
          victorias: p.victorias,
          derrotas: p.derrotas,
          torneos: 1,
          mejorPuesto: puesto,
        });
        fechaDelNombre.set(p.uid, fecha);
        continue;
      }
      previo.puntos += p.puntos;
      previo.victorias += p.victorias;
      previo.derrotas += p.derrotas;
      previo.torneos += 1;
      if (puesto !== null && (previo.mejorPuesto === null || puesto < previo.mejorPuesto)) previo.mejorPuesto = puesto;
      // El nombre más reciente gana: si el jugador lo cambió, la tabla muestra el actual.
      if (fecha >= (fechaDelNombre.get(p.uid) ?? '')) {
        previo.nombre = p.nombre;
        fechaDelNombre.set(p.uid, fecha);
      }
    }
  }

  const ordenadas = [...acumulado.values()].sort(compararFilas);
  const filas: FilaTemporada[] = [];
  ordenadas.forEach((fila, i) => {
    const anterior = filas[i - 1];
    const empata = anterior && anterior.puntos === fila.puntos && anterior.victorias === fila.victorias;
    filas.push({ ...fila, posicion: empata ? anterior.posicion : i + 1 });
  });
  return filas;
}

// ---------------------------------------------------------------------------
// Historial del jugador
// ---------------------------------------------------------------------------

export interface PremioJugador {
  cantidadProducto: number;
  /** Nombre del producto si todos los puestos ganados son del mismo; null = genérico ("sobres"). */
  productoNombre: string | null;
  credito: number;
}

export interface FilaHistorial {
  id: string;
  nombre: string;
  fecha: string;
  enCurso: boolean;
  /** Puesto final; null si el torneo sigue en curso o no quedó registrado. */
  puesto: number | null;
  victorias: number;
  derrotas: number;
  premio: PremioJugador | null;
}

export interface ResumenHistorial {
  ganados: number;
  perdidos: number;
  torneos: number;
}

function premioDe(premios: readonly PuestoPremio[], uid: string): PremioJugador | null {
  let cantidadProducto = 0;
  let credito = 0;
  const nombres = new Set<string>();
  for (const p of premios) {
    if (p.jugadorUid !== uid) continue;
    if (p.productoId) {
      cantidadProducto += Math.max(0, numeroFinito(p.cantidadProducto));
      nombres.add(p.productoNombre ?? '');
    }
    credito += Math.max(0, numeroFinito(p.creditoCafeteria));
  }
  const [unico] = [...nombres];
  const productoNombre = nombres.size === 1 && unico ? unico : null;
  return cantidadProducto > 0 || credito > 0 ? { cantidadProducto, productoNombre, credito } : null;
}

function recordEnVivo(torneo: Pick<Torneo, 'jugadores' | 'rondas'>, uid: string): { victorias: number; derrotas: number } {
  const mio = calcularStandings(torneo).find((s) => s.jugador.uid === uid);
  return { victorias: mio?.victorias ?? 0, derrotas: mio?.derrotas ?? 0 };
}

/** Filas del historial (en el orden recibido) y los totales de las métricas. */
export function historialDeJugador(
  torneos: readonly Torneo[],
  uid: string
): { filas: FilaHistorial[]; resumen: ResumenHistorial } {
  const filas = torneos.map((t): FilaHistorial => {
    const enCurso = t.estado === 'en_curso';
    const posicion = enCurso ? undefined : posicionesValidas(t.posiciones).find((p) => p.uid === uid);
    const record = posicion ?? recordEnVivo(t, uid);
    return {
      id: t.id,
      nombre: t.nombre,
      fecha: t.fecha,
      enCurso,
      puesto: posicion && posicion.puesto > 0 ? posicion.puesto : null,
      victorias: record.victorias,
      derrotas: record.derrotas,
      premio: premioDe(t.premios, uid),
    };
  });
  const resumen = filas.reduce<ResumenHistorial>(
    (acc, f) => ({ ganados: acc.ganados + f.victorias, perdidos: acc.perdidos + f.derrotas, torneos: acc.torneos + 1 }),
    { ganados: 0, perdidos: 0, torneos: 0 }
  );
  return { filas, resumen };
}

/** "3 sobres + $4.000", "1 sobre", "$8.000" o "—". */
export function textoPremio(premio: PremioJugador | null): string {
  if (!premio) return '—';
  const partes: string[] = [];
  if (premio.cantidadProducto > 0) {
    partes.push(
      premio.productoNombre
        ? `${premio.cantidadProducto} × ${premio.productoNombre}`
        : `${premio.cantidadProducto} ${premio.cantidadProducto === 1 ? 'sobre' : 'sobres'}`
    );
  }
  if (premio.credito > 0) partes.push(formatARS(premio.credito));
  return partes.length > 0 ? partes.join(' + ') : '—';
}

// ---------------------------------------------------------------------------
// Mi duelo
// ---------------------------------------------------------------------------

export interface MiPartida {
  ronda: Ronda;
  partida: Partida;
  soyJugador1: boolean;
  /** null = bye. */
  rival: JugadorTorneo | null;
}

export function miPartidaActual(torneo: Pick<Torneo, 'rondas' | 'rondaActual'>, uid: string): MiPartida | null {
  const ronda = torneo.rondas.find((r) => r.numero === torneo.rondaActual);
  if (!ronda) return null;
  for (const partida of ronda.partidas) {
    if (partida.jugador1.uid === uid) return { ronda, partida, soyJugador1: true, rival: partida.jugador2 };
    if (partida.jugador2?.uid === uid) return { ronda, partida, soyJugador1: false, rival: partida.jugador1 };
  }
  return null;
}

/**
 * Pasa un marcador entre la perspectiva del jugador1 (la que se guarda) y la mía.
 * Invertir es su propia inversa, así que sirve para ir y para volver.
 */
export function resultadoParaJugador(resultado: Resultado, soyJugador1: boolean): Resultado {
  return soyJugador1 ? resultado : invertirResultado(resultado);
}

/** true si el marcador, leído desde mi perspectiva, es una victoria mía. */
export function esVictoria(resultadoMio: Resultado): boolean {
  return ganaJugador1(resultadoMio);
}

/** Número de mesa a mostrar: la física del Salón si la hay, si no la del torneo. */
export function numeroDeMesa(partida: Pick<Partida, 'mesa' | 'mesaSalonNumero'>): number {
  return typeof partida.mesaSalonNumero === 'number' && partida.mesaSalonNumero > 0 ? partida.mesaSalonNumero : partida.mesa;
}

export type FaseReloj = 'sin_iniciar' | 'corriendo' | 'pausada' | 'extra';

export interface EstadoReloj {
  fase: FaseReloj;
  segundos: number;
  /** Quedan menos de 5 minutos con la ronda corriendo o pausada. */
  bajo: boolean;
}

export function estadoReloj(
  t: Pick<Torneo, 'rondaPausada' | 'rondaRestanteMs' | 'rondaFinEn' | 'minutosPorRonda'>,
  ahoraMs: number
): EstadoReloj {
  // Sin fin ni pausa, estadoTimer diría 'extra': para el jugador es un reloj que todavía no arrancó.
  if (!t.rondaPausada && !t.rondaFinEn) {
    return { fase: 'sin_iniciar', segundos: Math.max(0, Math.round(t.minutosPorRonda * 60)), bajo: false };
  }
  const segundos = segundosRestantes(t, ahoraMs);
  const estado = estadoTimer(t, ahoraMs);
  if (estado === 'extra') return { fase: 'extra', segundos: 0, bajo: false };
  return { fase: estado === 'pausado' ? 'pausada' : 'corriendo', segundos, bajo: segundos < SEGUNDOS_RELOJ_BAJO };
}
