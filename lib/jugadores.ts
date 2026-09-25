// Directorio público de jugadores: `jugadores/{uid}` = { uid, nombre, nombreBusqueda, creditoCafeteria, creadoEn }.
// Es lo único que el staff ve de un jugador (users/{uid} tiene el email y es privado).
// Sin Firebase a propósito: se testea en Jest.

export const LARGO_MAX_NOMBRE = 60;

export interface JugadorDirectorio {
  uid: string;
  nombre: string;
  nombreBusqueda: string;
  credito: number;
}

/** Minúsculas, sin tildes y con espacios simples: así "Pérez" y "perez" dan lo mismo al buscar. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LARGO_MAX_NOMBRE);
}

export function normalizarJugadorDirectorio(uid: string, data: Record<string, unknown> | undefined): JugadorDirectorio {
  const nombre = typeof data?.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Sin nombre';
  const credito = typeof data?.creditoCafeteria === 'number' && Number.isFinite(data.creditoCafeteria) ? Math.max(0, data.creditoCafeteria) : 0;
  const busqueda = typeof data?.nombreBusqueda === 'string' && data.nombreBusqueda ? data.nombreBusqueda : normalizarBusqueda(nombre);
  return { uid, nombre, nombreBusqueda: busqueda, credito };
}

/** Datos para dar de alta (o reparar) la entrada del directorio de un jugador. */
export function altaDirectorio(uid: string, nombre: string): Omit<JugadorDirectorio, 'credito'> & { creditoCafeteria: 0 } {
  const limpio = nombre.trim().replace(/\s+/g, ' ').slice(0, LARGO_MAX_NOMBRE);
  return { uid, nombre: limpio, nombreBusqueda: normalizarBusqueda(limpio), creditoCafeteria: 0 };
}

/**
 * Nombre a mostrar en listas del staff. Si hay dos jugadores que se llaman
 * igual, se agrega un sufijo corto del uid para no premiar ni cobrarle al
 * equivocado (el nombre lo elige cada jugador y no es único).
 */
export function etiquetasDesambiguadas(jugadores: readonly Pick<JugadorDirectorio, 'uid' | 'nombre' | 'nombreBusqueda'>[]): Map<string, string> {
  const cuenta = new Map<string, number>();
  for (const j of jugadores) cuenta.set(j.nombreBusqueda, (cuenta.get(j.nombreBusqueda) ?? 0) + 1);
  const etiquetas = new Map<string, string>();
  for (const j of jugadores) {
    const repetido = (cuenta.get(j.nombreBusqueda) ?? 0) > 1;
    etiquetas.set(j.uid, repetido ? `${j.nombre} · #${j.uid.slice(0, 4).toUpperCase()}` : j.nombre);
  }
  return etiquetas;
}
