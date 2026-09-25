import type { Role } from '../constants/roles';

// Rubros del catálogo. Los de cafetería los define el local en Ajustes (config.rubrosCafeteria);
// dos son del sistema: 'TCG' (vive en tcg_productos) y 'Mesa' (servicios sin stock: alquiler, agua…).

export const RUBRO_TCG = 'TCG';
export const RUBRO_SERVICIOS = 'Mesa';
export const RUBROS_CAFETERIA_POR_DEFECTO: readonly string[] = ['Café', 'Pastelería'];
export const MAX_RUBROS_CAFETERIA = 10;
export const LARGO_MAX_RUBRO = 24;

export type AreaRubro = 'cafeteria' | 'tcg' | 'servicio';

/** A qué parte del local pertenece un rubro: define quién lo ve en Stock y cómo se cobra. */
export function areaDeRubro(rubro: string): AreaRubro {
  if (rubro === RUBRO_TCG) return 'tcg';
  if (rubro === RUBRO_SERVICIOS) return 'servicio';
  return 'cafeteria';
}

export function esReservado(nombre: string): boolean {
  const n = nombre.trim().toLowerCase();
  return n === RUBRO_TCG.toLowerCase() || n === RUBRO_SERVICIOS.toLowerCase() || n === 'servicios';
}

/** Nombre para mostrar: 'Mesa' es un nombre interno, en pantalla son "Servicios". */
export function nombreRubro(rubro: string): string {
  return rubro === RUBRO_SERVICIOS ? 'Servicios' : rubro;
}

/** Limpia la lista que viene de Firestore: sin vacíos, repetidos ni nombres reservados. */
export function normalizarRubrosCafeteria(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [...RUBROS_CAFETERIA_POR_DEFECTO];
  const vistos = new Set<string>();
  const rubros: string[] = [];
  for (const v of valor) {
    if (typeof v !== 'string') continue;
    const limpio = v.replace(/\s+/g, ' ').trim().slice(0, LARGO_MAX_RUBRO);
    const clave = limpio.toLowerCase();
    if (!limpio || vistos.has(clave) || esReservado(limpio)) continue;
    vistos.add(clave);
    rubros.push(limpio);
  }
  return rubros.length > 0 ? rubros.slice(0, MAX_RUBROS_CAFETERIA) : [...RUBROS_CAFETERIA_POR_DEFECTO];
}

/** Todos los rubros del local, en el orden en que se muestran: cafetería, TCG y servicios. */
export function rubrosDelLocal(cafeteria: readonly string[]): string[] {
  return [...cafeteria, RUBRO_TCG, RUBRO_SERVICIOS];
}

/**
 * Ordena los rubros que aparecen en el catálogo: primero los del local en su orden y después
 * los que ya no están en la config (un rubro que se quitó no esconde sus productos).
 */
export function ordenarRubros(presentes: Iterable<string>, cafeteria: readonly string[]): string[] {
  const conocidos = rubrosDelLocal(cafeteria);
  const hay = new Set(presentes);
  const extra = [...hay].filter((r) => !conocidos.includes(r)).sort((a, b) => a.localeCompare(b, 'es'));
  const cafe = conocidos.filter((r) => areaDeRubro(r) === 'cafeteria' && hay.has(r));
  const resto = conocidos.filter((r) => areaDeRubro(r) !== 'cafeteria' && hay.has(r));
  return [...cafe, ...extra, ...resto];
}

/**
 * Qué rubros de stock ve y puede resolver cada rol. Stock y Hoy usan esta misma regla:
 * a nadie le llega un aviso de stock bajo que después no encuentra en su pantalla.
 */
export function veRubroEnStock(role: Role, rubro: string): boolean {
  if (role === 'admin') return true;
  if (role === 'mozo') return areaDeRubro(rubro) === 'cafeteria';
  if (role === 'juez') return areaDeRubro(rubro) === 'tcg';
  return false;
}
