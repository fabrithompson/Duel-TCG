import type { Turno } from './config';
import { fechaCorta, fechaLocal, minutosDelDia } from './fecha';

// Reglas puras de Ajustes y Equipo, separadas de Firebase para poder testearlas.

export const MIN_TURNOS = 1;
export const MAX_TURNOS = 4;
export const LARGO_NOMBRE_TURNO = 24;
export const LARGO_NOMBRE_LOCAL = 60;
export const LARGO_NOMBRE_TEMPORADA = 30;

const MINUTOS_DIA = 24 * 60;

export function limpiarTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

export function errorNombre(texto: string, largoMax: number, que: string): string | null {
  const limpio = limpiarTexto(texto);
  if (!limpio) return `Escribí ${que}.`;
  if (limpio.length > largoMax) return `Usá como máximo ${largoMax} caracteres.`;
  return null;
}

export function normalizarHora(texto: string): string | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const hhmm = `${m[1].padStart(2, '0')}:${m[2]}`;
  if (hhmm === '24:00') return '00:00';
  return minutosDelDia(hhmm) === null ? null : hhmm;
}

export function cruzaMedianoche(apertura: string, cierre: string): boolean {
  const a = minutosDelDia(apertura);
  const c = minutosDelDia(cierre);
  return a !== null && c !== null && c < a;
}

type Tramo = readonly [number, number];

function tramosDe(apertura: number, cierre: number): Tramo[] {
  if (apertura < cierre) return [[apertura, cierre]];
  const tramos: Tramo[] = [[apertura, MINUTOS_DIA]];
  if (cierre > 0) tramos.push([0, cierre]);
  return tramos;
}

function seSuperponen(a: readonly Tramo[], b: readonly Tramo[]): boolean {
  return a.some(([ai, af]) => b.some(([bi, bf]) => ai < bf && bi < af));
}

export type ResultadoTurnos = { ok: true; turnos: Turno[] } | { ok: false; error: string };

// Se rechazan superposiciones porque turnoActual() se queda con el primero que coincide.
export function validarTurnos(borrador: readonly Turno[]): ResultadoTurnos {
  if (borrador.length < MIN_TURNOS) return { ok: false, error: 'Tiene que haber al menos un turno.' };
  if (borrador.length > MAX_TURNOS) return { ok: false, error: `Podés tener hasta ${MAX_TURNOS} turnos.` };

  const limpios: Turno[] = [];
  const tramos: Tramo[][] = [];
  const nombres = new Set<string>();

  for (let i = 0; i < borrador.length; i++) {
    const t = borrador[i];
    const nombre = limpiarTexto(t.nombre);
    if (!nombre) return { ok: false, error: `Poné un nombre al turno ${i + 1}.` };
    if (nombre.length > LARGO_NOMBRE_TURNO) {
      return { ok: false, error: `El nombre del turno ${i + 1} es muy largo (máximo ${LARGO_NOMBRE_TURNO} caracteres).` };
    }
    const clave = nombre.toLocaleLowerCase('es');
    if (nombres.has(clave)) return { ok: false, error: `Hay dos turnos que se llaman "${nombre}".` };
    nombres.add(clave);

    const apertura = normalizarHora(t.apertura);
    if (!apertura) return { ok: false, error: `La apertura de "${nombre}" no es una hora válida. Usá HH:MM, por ejemplo 08:00.` };
    const cierre = normalizarHora(t.cierre);
    if (!cierre) return { ok: false, error: `El cierre de "${nombre}" no es una hora válida. Usá HH:MM, por ejemplo 15:00.` };
    if (apertura === cierre) return { ok: false, error: `"${nombre}" abre y cierra a la misma hora.` };

    const propios = tramosDe(minutosDelDia(apertura) ?? 0, minutosDelDia(cierre) ?? 0);
    const choca = tramos.findIndex((otros) => seSuperponen(propios, otros));
    if (choca >= 0) return { ok: false, error: `"${limpios[choca].nombre}" y "${nombre}" se superponen.` };

    tramos.push(propios);
    limpios.push({ nombre, apertura, cierre });
  }
  return { ok: true, turnos: limpios };
}

// Alinea al paso para que un valor viejo como 52 avance a 55 y no a 57.
export function pasoSiguiente(valor: number, paso: number, direccion: 1 | -1, lim: { readonly min: number; readonly max: number }): number {
  const alineado = direccion > 0 ? Math.floor(valor / paso) * paso + paso : Math.ceil(valor / paso) * paso - paso;
  return Math.min(lim.max, Math.max(lim.min, alineado));
}

export function fechaConAnio(iso: string, ahora: Date = new Date()): string {
  const anio = Number(iso.slice(0, 4));
  return anio && anio !== ahora.getFullYear() ? `${fechaCorta(iso)} ${anio}` : fechaCorta(iso);
}

function inicioDelDia(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function haceCuanto(ms: number | null, ahora: Date = new Date()): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  const diffMin = Math.floor((ahora.getTime() - ms) / 60000);
  if (diffMin < 1) return 'recién';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const fecha = new Date(ms);
  // Redondeo: un cambio de horario de verano corre la medianoche una hora.
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(fecha)) / 86_400_000);
  if (dias === 0 || diffMin < 12 * 60) return `hace ${Math.floor(diffMin / 60)} h`;
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return `el ${fechaConAnio(fechaLocal(fecha), ahora)}`;
}
