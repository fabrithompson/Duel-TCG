// Fechas en hora LOCAL del dispositivo. `toISOString()` devuelve UTC: en
// Argentina (UTC-3) una venta cobrada a las 22 h quedaba registrada con la
// fecha del día siguiente y desaparecía del cierre de caja.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD en hora local. */
export function fechaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** HH:MM en hora local, 24 h. */
export function horaLocal(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function sumarDias(d: Date, dias: number): Date {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/** Minutos desde medianoche para un "HH:MM"; null si el formato no es válido. */
export function minutosDelDia(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const DIAS_CORTOS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Inicial del día de la semana (L M X J V S D). */
export function diaCorto(d: Date): string {
  return DIAS_CORTOS[d.getDay()];
}

/** "26 jul" a partir de un YYYY-MM-DD. */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MESES[m - 1]}`;
}

/** Convierte un Timestamp de Firestore (o similar) a milisegundos, si se puede. */
export function aMilis(valor: unknown): number | null {
  if (valor && typeof valor === 'object' && 'toMillis' in valor && typeof (valor as { toMillis: unknown }).toMillis === 'function') {
    return (valor as { toMillis: () => number }).toMillis();
  }
  if (typeof valor === 'number') return valor;
  return null;
}
