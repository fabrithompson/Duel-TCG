import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { aMilis, diaCorto, fechaLocal, sumarDias } from '../lib/fecha';
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

// Las ventas cobradas por versiones anteriores de la app no tienen subtotal, crédito ni medio de pago.
export function normalizarVenta(id: string, data: Record<string, unknown>): VentaCaja {
  const items = normalizarLineas(data.items);
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
    fecha: typeof data.fecha === 'string' ? data.fecha : '',
    hora: typeof data.hora === 'string' ? data.hora : '',
    creadoEnMs: aMilis(data.creadoEn),
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

export function resumirCaja(ventas: readonly VentaCaja[], hoy: Date): ResumenCaja {
  const fechaHoy = fechaLocal(hoy);
  const totales = new Map<string, number>();
  for (const v of ventas) totales.set(v.fecha, (totales.get(v.fecha) ?? 0) + v.total);

  const deHoy = ventas.filter((v) => v.fecha === fechaHoy);
  const totalHoy = totales.get(fechaHoy) ?? 0;
  const cobros = deHoy.length;
  const consumo = deHoy.reduce((acc, v) => acc + v.subtotal, 0);
  const creditoAplicado = deHoy.reduce((acc, v) => acc + v.creditoAplicado, 0);

  const semanaPasada = totales.get(fechaLocal(sumarDias(hoy, -7))) ?? 0;
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

interface UseCajaResult {
  resumen: ResumenCaja;
  hoy: Date;
  cargando: boolean;
  error: unknown;
}

// Una semana y un día hacia atrás: el gráfico de 7 días más el mismo día de la semana pasada para la variación.
export function useCaja(): UseCajaResult {
  const [fechaHoy, setFechaHoy] = useState(() => fechaLocal());
  const [ventas, setVentas] = useState<VentaCaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Si la pantalla queda abierta pasada la medianoche, el cierre tiene que pasar al día nuevo.
  useEffect(() => {
    const id = setInterval(() => {
      const actual = fechaLocal();
      setFechaHoy((prev) => (prev === actual ? prev : actual));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const hoy = fechaDesdeISO(fechaHoy);
    setCargando(true);
    const q = query(
      collection(db, 'ventas'),
      where('fecha', '>=', fechaLocal(sumarDias(hoy, -7))),
      where('fecha', '<=', fechaHoy)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setVentas(snap.docs.map((d) => normalizarVenta(d.id, d.data())));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [fechaHoy]);

  const hoy = useMemo(() => fechaDesdeISO(fechaHoy), [fechaHoy]);
  const resumen = useMemo(() => resumirCaja(ventas, hoy), [ventas, hoy]);

  return { resumen, hoy, cargando, error };
}
