/**
 * Hora del servidor estimada.
 *
 * El reloj de la ronda se guarda como un instante (rondaFinEn) y cada teléfono
 * calcula lo que falta con su propia hora. Si el celular del juez o la TV del
 * local tienen la hora corrida, verían tiempos distintos. Cada sesión mide una
 * vez su desfase contra Firestore (useSincronizarReloj) y toda la app usa esta
 * hora para escribir y para leer el reloj.
 */

let desfaseMs = 0;

export function ahoraServidor(): number {
  return Date.now() + desfaseMs;
}

export function fijarDesfase(ms: number): void {
  if (Number.isFinite(ms)) desfaseMs = Math.round(ms);
}

export function desfaseActual(): number {
  return desfaseMs;
}

/**
 * El serverTimestamp se fija en algún momento entre que salió la escritura y
 * volvió la confirmación: se toma el punto medio del viaje como la hora local
 * equivalente.
 */
export function estimarDesfase(servidorMs: number, antesMs: number, despuesMs: number): number {
  return servidorMs - (antesMs + despuesMs) / 2;
}
