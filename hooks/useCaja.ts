import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { aMilis, diaCorto, fechaDeNegocio, fechaLocal, horaLocal, minutoDeJornada, sumarDias, type HorarioTurno } from '../lib/fecha';
import { normalizarTorneo, pozoCobrado } from '../lib/torneo';
import { ItemPedido, MEDIOS_PAGO, MedioPago, RUBROS, Rubro, subtotalDe } from '../lib/pedido';
import { normalizarLineas } from '../lib/salon';

export interface VentaCaja {
  id: string;
  mesaNum: number;
  items: ItemPedido[];
  subtotal: number;
  creditoAplicado: number;
  total: number;
  medioPago: MedioPago | null;
  fecha: string;
  hora: string;
  creadoEnMs: number | null;
}

const MEDIOS_VALIDOS: readonly string[] = [...MEDIOS_PAGO.map((m) => m.id), 'credito_torneo'];

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

// Las ventas cobradas por versiones anteriores de la app no tienen subtotal, crédito ni medio de pago,
// y guardaban la fecha en UTC (una venta de las 22 h caía al día siguiente). Como las ventas son
// inmutables, se corrige al leer: sin medio de pago, fecha y hora salen de la marca de tiempo.
export function normalizarVenta(id: string, data: Record<string, unknown>, turnos: readonly HorarioTurno[] = []): VentaCaja {
  const items = normalizarLineas(data.items);
  const legado = typeof data.medioPago !== 'string';
  const marcaMs = aMilis(data.creadoEn) ?? aMilis(data.timestamp);
  const fechaLegado = legado && marcaMs !== null ? new Date(marcaMs) : null;
  const creditoAplicado = Math.max(0, numero(data.creditoAplicado) ?? 0);
  const total = numero(data.total) ?? subtotalDe(items);
  return {
    id,
    mesaNum: numero(data.mesaNum) ?? 0,
    items,
    subtotal: numero(data.subtotal) ?? total + creditoAplicado,
    creditoAplicado,
    total,
    medioPago: typeof data.medioPago === 'string' && MEDIOS_VALIDOS.includes(data.medioPago) ? (data.medioPago as MedioPago) : null,
    fecha: fechaLegado ? fechaDeNegocio(turnos, fechaLegado) : typeof data.fecha === 'string' ? data.fecha : '',
    hora: fechaLegado ? horaLocal(fechaLegado) : typeof data.hora === 'string' ? data.hora : '',
    creadoEnMs: marcaMs,
  };
}

export interface BarraDia {
  fecha: string;
  letra: string;
  total: number;
  esHoy: boolean;
}

export interface FilaDesglose {
  clave: string;
  nombre: string;
  total: number;
  pct: number;
  tono: 'ink' | 'gold';
}

export interface ResumenCaja {
  fecha: string;
  totalHoy: number;
  cobros: number;
  ticketPromedio: number;
  creditoAplicado: number;
  /** null cuando el mismo día de la semana pasada no tuvo ventas (no hay contra qué comparar). */
  variacionPct: number | null;
  barras: BarraDia[];
  porRubro: FilaDesglose[];
  porMedio: FilaDesglose[];
  ultimos: VentaCaja[];
}

const NOMBRE_RUBRO: Record<Rubro, string> = {
  Café: 'Café',
  Pastelería: 'Pastelería',
  TCG: 'TCG',
  Mesa: 'Servicios de mesa',
};

export function nombreMedio(medio: MedioPago | null): string {
  if (medio === 'credito_torneo') return 'Crédito de torneo';
  return MEDIOS_PAGO.find((m) => m.id === medio)?.nombre ?? 'Sin dato';
}

function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

interface OpcionesResumen {
  turnos?: readonly HorarioTurno[];
  /**
   * Con el día en curso, minuto de la jornada hasta el que se compara: la semana pasada se
   * cuenta hasta la misma hora (si no, lo cobrado a media tarde parece una caída contra un día completo).
   */
  hastaMinuto?: number | null;
}

export function resumirCaja(ventas: readonly VentaCaja[], hoy: Date, opciones: OpcionesResumen = {}): ResumenCaja {
  const { turnos = [], hastaMinuto = null } = opciones;
  const fechaHoy = fechaLocal(hoy);
  const totales = new Map<string, number>();
  for (const v of ventas) totales.set(v.fecha, (totales.get(v.fecha) ?? 0) + v.total);

  const deHoy = ventas.filter((v) => v.fecha === fechaHoy);
  const totalHoy = totales.get(fechaHoy) ?? 0;
  const cobros = deHoy.length;
  const consumo = deHoy.reduce((acc, v) => acc + v.subtotal, 0);
  const creditoAplicado = deHoy.reduce((acc, v) => acc + v.creditoAplicado, 0);

  const fechaSemanaPasada = fechaLocal(sumarDias(hoy, -7));
  const semanaPasada = ventas
    .filter((v) => v.fecha === fechaSemanaPasada)
    .filter((v) => {
      if (hastaMinuto === null) return true;
      const m = minutoDeJornada(v.hora, turnos);
      return m === null || m <= hastaMinuto;
    })
    .reduce((acc, v) => acc + v.total, 0);
  const variacionPct = semanaPasada > 0 ? Math.round(((totalHoy - semanaPasada) / semanaPasada) * 100) : null;

  const barras: BarraDia[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = sumarDias(hoy, -i);
    const fecha = fechaLocal(d);
    barras.push({ fecha, letra: diaCorto(d), total: totales.get(fecha) ?? 0, esHoy: i === 0 });
  }

  const rubros = new Map<Rubro, number>();
  for (const v of deHoy) for (const i of v.items) rubros.set(i.rubro, (rubros.get(i.rubro) ?? 0) + i.precio * i.cantidad);
  const totalRubros = [...rubros.values()].reduce((a, b) => a + b, 0);
  const porRubro: FilaDesglose[] = RUBROS.filter((r) => (rubros.get(r) ?? 0) > 0)
    .map((r) => ({ clave: r, nombre: NOMBRE_RUBRO[r], total: rubros.get(r) ?? 0, pct: porcentaje(rubros.get(r) ?? 0, totalRubros), tono: 'ink' as const }))
    .sort((a, b) => b.total - a.total);

  // El crédito de torneo no entra a caja pero sí cubre consumo: se muestra aparte para que las filas sumen lo consumido.
  const medios = new Map<string, { medio: MedioPago | null; total: number }>();
  for (const v of deHoy) {
    if (v.total <= 0) continue;
    const clave = v.medioPago ?? 'sin_dato';
    const previo = medios.get(clave);
    medios.set(clave, { medio: v.medioPago, total: (previo?.total ?? 0) + v.total });
  }
  const porMedio: FilaDesglose[] = [...medios.entries()]
    .map(([clave, m]) => ({ clave, nombre: nombreMedio(m.medio), total: m.total, pct: porcentaje(m.total, consumo), tono: 'ink' as const }))
    .sort((a, b) => b.total - a.total);
  if (creditoAplicado > 0) {
    porMedio.push({ clave: 'credito_torneo', nombre: 'Crédito de torneo', total: creditoAplicado, pct: porcentaje(creditoAplicado, consumo), tono: 'gold' });
  }

  const ultimos = [...deHoy]
    .sort((a, b) => b.hora.localeCompare(a.hora) || (b.creadoEnMs ?? 0) - (a.creadoEnMs ?? 0))
    .slice(0, 12);

  return {
    fecha: fechaHoy,
    totalHoy,
    cobros,
    ticketPromedio: cobros > 0 ? Math.round(consumo / cobros) : 0,
    creditoAplicado,
    variacionPct,
    barras,
    porRubro,
    porMedio,
    ultimos,
  };
}

function fechaDesdeISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface InscripcionesDia {
  total: number;
  pagas: number;
  torneos: number;
}

interface UseCajaResult {
  resumen: ResumenCaja;
  /** Día que se está mirando (jornada). */
  hoy: Date;
  /** true si es la jornada en curso. */
  esHoy: boolean;
  /** YYYY-MM-DD de la jornada en curso. */
  fechaHoy: string;
  /** Inscripciones de torneo marcadas como pagas ese día: las cobra el juez y no son ventas. */
  inscripciones: InscripcionesDia;
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

/**
 * Cierre de una jornada (por defecto la actual) con una semana hacia atrás: el gráfico de 7 días
 * más el mismo día de la semana pasada para la variación.
 */
export function useCaja(turnos: readonly HorarioTurno[], fechaElegida: string | null = null): UseCajaResult {
  const [fechaHoy, setFechaHoy] = useState(() => fechaDeNegocio(turnos));
  const [ventas, setVentas] = useState<VentaCaja[]>([]);
  const [inscripciones, setInscripciones] = useState<InscripcionesDia>({ total: 0, pagas: 0, torneos: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());

  // Si la pantalla queda abierta al terminar la jornada, el cierre pasa al día nuevo.
  useEffect(() => {
    const tick = () => {
      const actual = fechaDeNegocio(turnos);
      setFechaHoy((prev) => (prev === actual ? prev : actual));
      setAhora(new Date());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [turnos]);

  const dia = fechaElegida ?? fechaHoy;

  useEffect(() => {
    const d = fechaDesdeISO(dia);
    setCargando(true);
    const q = query(
      collection(db, 'ventas'),
      where('fecha', '>=', fechaLocal(sumarDias(d, -7))),
      where('fecha', '<=', dia)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setVentas(snap.docs.map((doc) => normalizarVenta(doc.id, doc.data(), turnos)));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [dia, turnos, intento]);

  // Las inscripciones que el juez marcó como pagas ese día: entran a la caja aunque no sean ventas.
  useEffect(() => {
    const q = query(collection(db, 'torneos'), where('fecha', '==', dia));
    return onSnapshot(
      q,
      (snap) => {
        const torneos = snap.docs.map((doc) => normalizarTorneo(doc.id, doc.data()));
        setInscripciones({
          total: torneos.reduce((acc, t) => acc + pozoCobrado(t), 0),
          pagas: torneos.reduce((acc, t) => acc + t.jugadores.filter((j) => j.pagado).length, 0),
          torneos: torneos.length,
        });
      },
      () => setInscripciones({ total: 0, pagas: 0, torneos: 0 })
    );
  }, [dia, intento]);

  const esHoy = dia === fechaHoy;
  const hoy = useMemo(() => fechaDesdeISO(dia), [dia]);
  const hastaMinuto = esHoy ? minutoDeJornada(horaLocal(ahora), turnos) : null;
  const resumen = useMemo(() => resumirCaja(ventas, hoy, { turnos, hastaMinuto }), [ventas, hoy, turnos, hastaMinuto]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { resumen, hoy, esHoy, fechaHoy, inscripciones, cargando, error, reintentar };
}
