import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Query,
  QueryDocumentSnapshot,
  where,
} from 'firebase/firestore';
import type { Href } from 'expo-router';
import { db } from '../config/firebase';
import type { Role } from '../constants/roles';
import { aMilis, fechaDeNegocio, type HorarioTurno } from '../lib/fecha';
import { ahoraServidor } from '../lib/reloj';
import { CatalogoItem, formatARS, formatCantidad, MEDIOS_PAGO, rubrosDeStock, stockBajo } from '../lib/pedido';
import { mesasSalonEnDuelo, normalizarTorneo, premiosPorEntregar, segundosRestantes, type Torneo } from '../lib/torneo';
import { normalizarProducto, normalizarProductoTcg } from './useCatalogo';
import { estadoVisual, Mesa, normalizarMesa } from './useMesas';

export type TonoPendiente = 'dg' | 'gold' | 'br';

export interface Pendiente {
  id: string;
  titulo: string;
  subtitulo: string;
  tono: TonoPendiente;
  destino: Href;
  /** Para lectores de pantalla: adónde lleva tocarlo. */
  hint: string;
}

export interface CobroHoy {
  id: string;
  total: number;
  hora: string;
  mesaNum: number;
  medio: string;
  creadoMs: number | null;
}

export interface TorneoHoy {
  id: string;
  nombre: string;
  estado: string;
  rondaActual: number;
  totalRondas: number;
  jugadores: number;
  resultadosPendientes: number;
  /** ids de mesas del Salón con una partida de la ronda actual sin resultado. */
  mesasEnDuelo: string[];
  premiosSinEntregar: number;
  rondaFinEn: number | null;
  rondaRestanteMs: number | null;
  rondaPausada: boolean;
}

interface StaffPendiente {
  id: string;
  role: string;
}

export interface HoyData {
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
  ahora: number;
  totalDia: number;
  mesasOcupadas: number;
  mesasTotal: number;
  cuentasAbiertas: number;
  /** Último torneo creado, solo si sigue en curso. */
  torneo: TorneoHoy | null;
  /** Mesas del Salón con un duelo en juego (cuentan como ocupadas aunque no tengan cuenta). */
  mesasEnDuelo: number;
  stockBajo: CatalogoItem[];
  pendientes: Pendiente[];
  cobrosRecientes: CobroHoy[];
}

const TICK_MS = 60_000;
const MAX_MESAS_PENDIENTES = 5;
const MAX_COBROS = 5;
// Premios olvidados de torneos anteriores: se miran los últimos, no toda la historia.
const TORNEOS_RECIENTES = 12;

const NOMBRE_MEDIO: Record<string, string> = {
  ...Object.fromEntries(MEDIOS_PAGO.map((m) => [m.id, m.nombre])),
  credito_torneo: 'Crédito de torneo',
};

function numeroFinito(valor: unknown, fallback = 0): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : fallback;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return n === 1 ? singular : pluralTexto;
}

export function normalizarCobro(id: string, data: Record<string, unknown>): CobroHoy {
  const medio = typeof data.medioPago === 'string' ? data.medioPago : '';
  return {
    id,
    total: numeroFinito(data.total),
    hora: typeof data.hora === 'string' ? data.hora : '--:--',
    mesaNum: numeroFinito(data.mesaNum),
    medio: NOMBRE_MEDIO[medio] ?? 'Otro medio',
    creadoMs: aMilis(data.creadoEn),
  };
}

/** Resumen de un torneo para Hoy, derivado del mismo normalizador que usan Torneo y Premios. */
export function torneoHoyDe(t: Torneo, conCredito = true): TorneoHoy {
  const ronda = t.rondas.find((r) => r.numero === t.rondaActual);
  const sinResultado = ronda?.partidas.filter((p) => p.jugador2 !== null && p.resultado === null) ?? [];
  return {
    id: t.id,
    nombre: t.nombre,
    estado: t.estado,
    rondaActual: t.rondaActual,
    totalRondas: t.totalRondas,
    jugadores: t.jugadores.length,
    resultadosPendientes: t.estado === 'en_curso' ? sinResultado.length : 0,
    mesasEnDuelo: [...mesasSalonEnDuelo(t)],
    premiosSinEntregar: premiosPorEntregar(t, conCredito),
    rondaFinEn: t.rondaFinEn,
    rondaRestanteMs: t.rondaRestanteMs,
    rondaPausada: t.rondaPausada,
  };
}

// Tolera docs viejos (partidas con `ganador`, jugadores como texto) igual que el resto de la app.
export function normalizarTorneoHoy(id: string, data: Record<string, unknown>, conCredito = true): TorneoHoy {
  return torneoHoyDe(normalizarTorneo(id, data), conCredito);
}

function totalPedido(mesa: Mesa): { total: number; unidades: number } {
  return mesa.pedido.reduce(
    (acc, item) => {
      const cantidad = numeroFinito(item?.cantidad);
      return { total: acc.total + numeroFinito(item?.precio) * cantidad, unidades: acc.unidades + cantidad };
    },
    { total: 0, unidades: 0 }
  );
}

export function mesaConCuenta(mesa: Mesa): boolean {
  return estadoVisual(mesa.estado) === 'consumo' || mesa.pedido.length > 0;
}

function resumenStaff(staff: readonly StaffPendiente[]): string {
  const mozos = staff.filter((s) => s.role === 'mozo').length;
  const jueces = staff.filter((s) => s.role === 'juez').length;
  const partes = [
    mozos > 0 ? `${mozos} ${plural(mozos, 'mozo', 'mozos')}` : null,
    jueces > 0 ? `${jueces} ${plural(jueces, 'juez', 'jueces')}` : null,
  ].filter((p): p is string => p !== null);
  return partes.length > 0 ? partes.join(' y ') : 'Revisalas en Ajustes → Equipo';
}

function resumenStock(items: readonly CatalogoItem[]): { titulo: string; subtitulo: string } {
  if (items.length === 1) {
    const item = items[0];
    const stock = item.stock ?? 0;
    return {
      titulo: stock <= 0 ? `${item.nombre}: sin stock` : `Quedan ${formatCantidad(stock, item.unidad)} de ${item.nombre}`,
      subtitulo: 'Por debajo del mínimo de alerta',
    };
  }
  const agotados = items.filter((i) => (i.stock ?? 0) <= 0).length;
  const nombres = items.slice(0, 2).map((i) => i.nombre).join(', ');
  const resto = items.length - 2;
  return {
    titulo: `${items.length} productos con stock bajo`,
    subtitulo: `${nombres}${resto > 0 ? ` y ${resto} más` : ''}${agotados > 0 ? ` · ${agotados} sin stock` : ''}`,
  };
}

const PRIORIDAD: Record<TonoPendiente, number> = { dg: 0, gold: 1, br: 2 };

export interface EntradaPendientes {
  role: Role;
  mesas: readonly Mesa[];
  /** Los últimos torneos, del más nuevo al más viejo: el primero manda para resultados; todos, para premios. */
  torneos: readonly TorneoHoy[];
  stockBajo: readonly CatalogoItem[];
  staffPendiente: readonly StaffPendiente[];
  ahoraMs: number;
}

/** Lo que hay que resolver ahora, de lo más urgente a lo menos; cada uno lleva adonde se resuelve. */
export function armarPendientes({ role, mesas, torneos, stockBajo: bajos, staffPendiente, ahoraMs }: EntradaPendientes): Pendiente[] {
  const torneo = torneos[0] ?? null;
  const pendientes: Pendiente[] = [];
  const operaCafe = role === 'admin' || role === 'mozo';
  const operaTorneo = role === 'admin' || role === 'juez';

  if (operaTorneo && torneo?.estado === 'en_curso' && torneo.resultadosPendientes > 0) {
    const n = torneo.resultadosPendientes;
    const sinTiempo = !torneo.rondaPausada && torneo.rondaFinEn !== null && segundosRestantes(torneo, ahoraMs) === 0;
    pendientes.push({
      id: `resultados-${torneo.id}`,
      titulo: `${n} ${plural(n, 'resultado sin cargar', 'resultados sin cargar')}`,
      subtitulo: `${torneo.nombre} · Ronda ${torneo.rondaActual} de ${torneo.totalRondas}${sinTiempo ? ' · se terminó el tiempo' : ''}`,
      tono: sinTiempo ? 'dg' : 'gold',
      destino: '/(tabs)/torneo',
      hint: 'Abre el torneo para cargar los resultados',
    });
  }

  // Cada torneo cerrado con premios sin entregar, aunque ya se haya creado otro después.
  if (operaTorneo) {
    torneos
      .filter((t) => t.estado === 'finalizado' && t.premiosSinEntregar > 0)
      .forEach((t) => {
        const n = t.premiosSinEntregar;
        pendientes.push({
          id: `premios-${t.id}`,
          titulo: `${n} ${plural(n, 'premio sin entregar', 'premios sin entregar')}`,
          subtitulo: t.nombre,
          tono: 'gold',
          destino: { pathname: '/(tabs)/premios', params: { torneoId: t.id } },
          hint: 'Abre Premios para entregarlos',
        });
      });
  }

  if (bajos.length > 0) {
    const { titulo, subtitulo } = resumenStock(bajos);
    pendientes.push({ id: 'stock-bajo', titulo, subtitulo, tono: 'dg', destino: '/(tabs)/stock', hint: 'Abre Stock' });
  }

  if (operaCafe) {
    const abiertas = mesas.filter(mesaConCuenta).sort((a, b) => a.numero - b.numero);
    abiertas.slice(0, MAX_MESAS_PENDIENTES).forEach((mesa) => {
      const { total, unidades } = totalPedido(mesa);
      pendientes.push({
        id: `mesa-${mesa.id}`,
        titulo: `Mesa ${pad2(mesa.numero)} con cuenta abierta`,
        subtitulo:
          unidades > 0
            ? `${formatARS(total)} · ${unidades} ${plural(unidades, 'ítem', 'ítems')}`
            : 'Todavía sin pedido cargado',
        tono: 'br',
        destino: { pathname: '/(tabs)/salon/pedido', params: { mesaId: mesa.id } },
        hint: 'Abre el pedido de la mesa',
      });
    });
    const resto = abiertas.length - MAX_MESAS_PENDIENTES;
    if (resto > 0) {
      pendientes.push({
        id: 'mesas-resto',
        titulo: `${resto} ${plural(resto, 'mesa más', 'mesas más')} con cuenta abierta`,
        subtitulo: 'Miralas en el plano del salón',
        tono: 'br',
        destino: '/(tabs)/salon',
        hint: 'Abre el Salón',
      });
    }
  }

  if (role === 'admin' && staffPendiente.length > 0) {
    const n = staffPendiente.length;
    pendientes.push({
      id: 'staff-pendiente',
      titulo: `${n} ${plural(n, 'cuenta de staff esperando aprobación', 'cuentas de staff esperando aprobación')}`,
      subtitulo: resumenStaff(staffPendiente),
      tono: 'br',
      destino: '/(tabs)/ajustes/equipo',
      hint: 'Abre Equipo para aprobarlas o rechazarlas',
    });
  }

  return pendientes
    .map((p, i) => ({ p, i }))
    .sort((a, b) => PRIORIDAD[a.p.tono] - PRIORIDAD[b.p.tono] || a.i - b.i)
    .map(({ p }) => p);
}

interface EstadoColeccion<T> {
  clave: string | null;
  datos: T[];
  error: unknown;
}

// `clave` resume todo lo que define la consulta: si cambia, se re-suscribe; null = el rol no la puede leer.
function useColeccion<T>(clave: string | null, crear: () => Query, mapear: (d: QueryDocumentSnapshot) => T) {
  const [estado, setEstado] = useState<EstadoColeccion<T>>({ clave: null, datos: [], error: null });

  useEffect(() => {
    if (clave === null) return undefined;
    let activo = true;
    const unsub = onSnapshot(
      crear(),
      (snap) => {
        if (activo) setEstado({ clave, datos: snap.docs.map(mapear), error: null });
      },
      (error) => {
        if (activo) setEstado((prev) => ({ clave, datos: prev.clave === clave ? prev.datos : [], error }));
      }
    );
    return () => {
      activo = false;
      unsub();
    };
  }, [clave]);

  const vigente = clave !== null && estado.clave === clave;
  return {
    datos: vigente ? estado.datos : ([] as T[]),
    cargando: clave !== null && !vigente,
    error: vigente ? estado.error : null,
  };
}

/** Datos de la pantalla Hoy, suscribiéndose solo a lo que el rol necesita (y las reglas le dejan leer). */
export function useHoy(role: Role, alertaStock: number, conCredito = true, turnos: readonly HorarioTurno[] = []): HoyData {
  const [ahora, setAhora] = useState(() => ahoraServidor());
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setAhora(ahoraServidor()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Día de caja: pasada la medianoche de un turno nocturno, lo cobrado sigue sumando al día que empezó.
  const fecha = fechaDeNegocio(turnos, new Date(ahora));
  const operaCafe = role === 'admin' || role === 'mozo';
  const operaTorneo = role === 'admin' || role === 'juez';
  const esStaff = operaCafe || operaTorneo;

  const ventas = useColeccion(
    operaCafe ? `ventas:${fecha}:${intento}` : null,
    () => query(collection(db, 'ventas'), where('fecha', '==', fecha)),
    (d) => normalizarCobro(d.id, d.data())
  );
  const mesas = useColeccion(
    operaCafe ? `mesas:${intento}` : null,
    () => collection(db, 'mesas'),
    (d) => normalizarMesa(d.id, d.data())
  );
  const productos = useColeccion(
    esStaff ? `productos:${intento}` : null,
    () => collection(db, 'productos'),
    (d) => normalizarProducto(d.id, d.data())
  );
  const tcg = useColeccion(
    esStaff ? `tcg:${intento}` : null,
    () => collection(db, 'tcg_productos'),
    (d) => normalizarProductoTcg(d.id, d.data())
  );
  // El mozo también: las mesas en duelo cuentan como ocupadas en su métrica, igual que en el Salón.
  const torneos = useColeccion(
    esStaff ? `torneos:${conCredito}:${intento}` : null,
    () => query(collection(db, 'torneos'), orderBy('creadoEn', 'desc'), limit(TORNEOS_RECIENTES)),
    (d) => normalizarTorneoHoy(d.id, d.data(), conCredito)
  );
  const staff = useColeccion<StaffPendiente>(
    role === 'admin' ? `staff:${intento}` : null,
    () => query(collection(db, 'users'), where('estadoAprobacion', '==', 'pendiente')),
    (d) => ({ id: d.id, role: typeof d.data().role === 'string' ? (d.data().role as string) : '' })
  );

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const fuentes = [ventas, mesas, productos, tcg, torneos, staff];
  const error = fuentes.find((f) => f.error)?.error ?? null;

  const ultimoTorneo = torneos.datos[0] ?? null;
  const torneoEnCurso = ultimoTorneo?.estado === 'en_curso' ? ultimoTorneo : null;
  const enDuelo = new Set(torneoEnCurso?.mesasEnDuelo ?? []);

  const rubros = rubrosDeStock(role);
  const catalogo = [...productos.datos, ...tcg.datos].filter((i) => i.activo);
  const bajos = catalogo
    .filter((i) => rubros.includes(i.rubro))
    .filter((i) => stockBajo(i, alertaStock))
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));

  const cobrosRecientes = [...ventas.datos]
    .sort((a, b) => b.hora.localeCompare(a.hora) || (b.creadoMs ?? Number.MAX_SAFE_INTEGER) - (a.creadoMs ?? Number.MAX_SAFE_INTEGER))
    .slice(0, MAX_COBROS);

  return {
    cargando: fuentes.some((f) => f.cargando),
    error,
    reintentar,
    ahora,
    totalDia: ventas.datos.reduce((acc, v) => acc + v.total, 0),
    mesasOcupadas: mesas.datos.filter((m) => estadoVisual(m.estado, enDuelo.has(m.id)) !== 'libre').length,
    mesasEnDuelo: mesas.datos.filter((m) => enDuelo.has(m.id)).length,
    mesasTotal: mesas.datos.length,
    cuentasAbiertas: mesas.datos.filter(mesaConCuenta).length,
    torneo: torneoEnCurso,
    stockBajo: bajos,
    pendientes: armarPendientes({
      role,
      mesas: mesas.datos,
      torneos: torneos.datos,
      stockBajo: bajos,
      staffPendiente: staff.datos.filter((s) => s.role === 'mozo' || s.role === 'juez'),
      ahoraMs: ahora,
    }),
    cobrosRecientes,
  };
}
