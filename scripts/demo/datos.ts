// Datos de prueba del modo demo: un local con mesas, carta, stock, ventas de la semana,
// un torneo en curso y dos cerrados. Los torneos se arman con la misma lógica de la app
// (lib/torneo), así emparejamientos, tabla y premios son los que la app calcularía.

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, Timestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { CONFIG_DEFAULT } from '../../lib/config';
import { CLAVE_DEMO, CUENTAS_DEMO, PROYECTO_DEMO, PUERTOS_DEMO, type CuentaDemo } from '../../lib/demo';
import { fechaDeNegocio, fechaLocal, horaLocal, sumarDias } from '../../lib/fecha';
import { normalizarBusqueda } from '../../lib/jugadores';
import type { ItemPedido, MedioPago } from '../../lib/pedido';
import {
  asignarPremios,
  crearRng,
  generarRonda,
  posicionesFinales,
  RESULTADOS,
  timerNuevaRonda,
  type JugadorTorneo,
  type MesaDuelo,
  type PuestoPremio,
  type Rng,
  type Ronda,
} from '../../lib/torneo';

export const CODIGO_DEMO = 'DUEL2345';

const HOST = '127.0.0.1';
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

const uid = (role: CuentaDemo['role']): string => CUENTAS_DEMO.find((c) => c.role === role)!.uid;
const ADMIN = uid('admin');
const JUEZ = uid('juez');
const MOZO = uid('mozo');
const JUGADOR = uid('jugador');

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

interface Producto {
  id: string;
  nombre: string;
  precio: number;
  rubro: string;
  stock: number | null;
}

const CARTA: readonly Producto[] = [
  { id: 'cafe-espresso', nombre: 'Espresso', precio: 2200, rubro: 'Café', stock: null },
  { id: 'cafe-cortado', nombre: 'Cortado', precio: 2500, rubro: 'Café', stock: null },
  { id: 'cafe-con-leche', nombre: 'Café con leche', precio: 2800, rubro: 'Café', stock: null },
  { id: 'cafe-capuccino', nombre: 'Capuccino', precio: 3300, rubro: 'Café', stock: null },
  { id: 'cafe-latte', nombre: 'Latte', precio: 3400, rubro: 'Café', stock: null },
  { id: 'cafe-submarino', nombre: 'Submarino', precio: 3600, rubro: 'Café', stock: null },
  { id: 'cafe-licuado', nombre: 'Licuado de banana', precio: 3800, rubro: 'Café', stock: null },
  { id: 'pas-medialuna', nombre: 'Medialuna', precio: 900, rubro: 'Pastelería', stock: 30 },
  { id: 'pas-tostado', nombre: 'Tostado de jamón y queso', precio: 5200, rubro: 'Pastelería', stock: 12 },
  { id: 'pas-brownie', nombre: 'Brownie', precio: 2800, rubro: 'Pastelería', stock: 3 },
  { id: 'pas-alfajor', nombre: 'Alfajor de maicena', precio: 1600, rubro: 'Pastelería', stock: 14 },
  { id: 'pas-cookie', nombre: 'Cookie con chips', precio: 1900, rubro: 'Pastelería', stock: 0 },
  { id: 'mesa-alquiler', nombre: 'Alquiler de mesa · 1 h', precio: 2500, rubro: 'Mesa', stock: null },
  { id: 'mesa-agua', nombre: 'Agua caliente (termo)', precio: 1200, rubro: 'Mesa', stock: null },
];

const TCG: readonly Producto[] = [
  { id: 'tcg-sobre-pokemon', nombre: 'Sobre Pokémon Escarlata y Púrpura', precio: 7500, rubro: 'TCG', stock: 48 },
  { id: 'tcg-sobre-magic', nombre: 'Sobre Magic Play Booster', precio: 9800, rubro: 'TCG', stock: 4 },
  { id: 'tcg-sobre-onepiece', nombre: 'Sobre One Piece OP-10', precio: 8200, rubro: 'TCG', stock: 22 },
  { id: 'tcg-folios', nombre: 'Folios Dragon Shield x100', precio: 13500, rubro: 'TCG', stock: 9 },
  { id: 'tcg-deckbox', nombre: 'Deck box Ultimate Guard', precio: 10500, rubro: 'TCG', stock: 2 },
];

function item(id: string, cantidad: number): ItemPedido {
  const p = [...CARTA, ...TCG].find((x) => x.id === id);
  if (!p) throw new Error(`Producto demo desconocido: ${id}`);
  return { itemId: p.id, nombre: p.nombre, precio: p.precio, cantidad, rubro: p.rubro, origen: p.rubro === 'TCG' ? 'tcg' : 'productos' };
}

const subtotal = (items: readonly ItemPedido[]): number => items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);

// ---------------------------------------------------------------------------
// Salón
// ---------------------------------------------------------------------------

interface MesaDemo {
  id: string;
  numero: number;
  salaId: string;
  tipo: 'cafe' | 'duelo';
  x: number;
  y: number;
  pedido: ItemPedido[];
}

const SALAS = [
  { id: 'demo-sala-salon', nombre: 'Salón', orden: 0 },
  { id: 'demo-sala-patio', nombre: 'Patio', orden: 1 },
];

function mesa(numero: number, salaId: string, tipo: MesaDemo['tipo'], x: number, y: number, pedido: ItemPedido[] = []): MesaDemo {
  return { id: `demo-mesa-${String(numero).padStart(2, '0')}`, numero, salaId, tipo, x, y, pedido };
}

const MESAS: readonly MesaDemo[] = [
  mesa(1, 'demo-sala-salon', 'duelo', 0, 0),
  mesa(2, 'demo-sala-salon', 'duelo', 1, 0, [item('cafe-submarino', 1), item('mesa-agua', 1)]),
  mesa(3, 'demo-sala-salon', 'duelo', 0, 0.3333),
  mesa(4, 'demo-sala-salon', 'duelo', 1, 0.3333),
  mesa(5, 'demo-sala-salon', 'cafe', 0, 0.6667, [item('cafe-cortado', 2), item('pas-medialuna', 4)]),
  mesa(6, 'demo-sala-salon', 'cafe', 0.5, 0.6667),
  mesa(7, 'demo-sala-salon', 'cafe', 1, 0.6667),
  mesa(8, 'demo-sala-salon', 'cafe', 0, 1, [item('cafe-latte', 1), item('pas-tostado', 1), item('pas-brownie', 1)]),
  mesa(9, 'demo-sala-salon', 'cafe', 0.5, 1),
  mesa(10, 'demo-sala-salon', 'cafe', 1, 1),
  mesa(11, 'demo-sala-patio', 'cafe', 0, 0),
  mesa(12, 'demo-sala-patio', 'cafe', 1, 0, [item('cafe-licuado', 2), item('pas-alfajor', 2)]),
  mesa(13, 'demo-sala-patio', 'cafe', 0.5, 0.6667),
];

const MESAS_DUELO: readonly MesaDuelo[] = MESAS.filter((m) => m.tipo === 'duelo').map((m) => ({ id: m.id, numero: m.numero }));

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------

const JUGADORES: readonly { uid: string; nombre: string; credito: number }[] = [
  { uid: JUGADOR, nombre: 'Tomás Herrera', credito: 3500 },
  { uid: 'demo-j-lucia', nombre: 'Lucía Fernández', credito: 0 },
  { uid: 'demo-j-martin', nombre: 'Martín Gómez', credito: 1200 },
  { uid: 'demo-j-sofia', nombre: 'Sofía Díaz', credito: 0 },
  { uid: 'demo-j-julian', nombre: 'Julián Romero', credito: 0 },
  { uid: 'demo-j-valentina', nombre: 'Valentina Sosa', credito: 800 },
  { uid: 'demo-j-agustin', nombre: 'Agustín Castro', credito: 0 },
  { uid: 'demo-j-micaela', nombre: 'Micaela Luna', credito: 0 },
  { uid: 'demo-j-joaquin', nombre: 'Joaquín Vega', credito: 0 },
];

function inscriptos(uids: readonly string[], sinPagar: readonly string[] = []): JugadorTorneo[] {
  return uids.map((u) => {
    const j = JUGADORES.find((x) => x.uid === u);
    if (!j) throw new Error(`Jugador demo desconocido: ${u}`);
    return { uid: j.uid, nombre: j.nombre, pagado: !sinPagar.includes(u) };
  });
}

// ---------------------------------------------------------------------------
// Torneos
// ---------------------------------------------------------------------------

const PREMIOS_BASE: readonly PuestoPremio[] = [
  { puesto: 1, cantidadProducto: 3, creditoCafeteria: 5000 },
  { puesto: 2, cantidadProducto: 2, creditoCafeteria: 2000 },
  { puesto: 3, cantidadProducto: 1, creditoCafeteria: 0 },
].map((p) => ({
  ...p,
  jugadorUid: null,
  productoId: 'tcg-sobre-pokemon',
  productoOrigen: 'tcg' as const,
  productoNombre: 'Sobre Pokémon Escarlata y Púrpura',
  entregado: false,
}));

/** Rondas suizas con la lógica de la app; `sinResultado` deja pendientes las partidas de esos jugadores en la última. */
function jugarRondas(jugadores: JugadorTorneo[], totalRondas: number, jugadas: number, semillaBase: number, sinResultado: readonly string[] = []): Ronda[] {
  const rondas: Ronda[] = [];
  const rng: Rng = crearRng(semillaBase);
  for (let n = 1; n <= jugadas; n++) {
    const semilla = semillaBase + n;
    const ronda: Ronda = {
      ...generarRonda({ jugadores, rondas, formatoId: 'suizo', totalRondas, topCut: 0 }, n, MESAS_DUELO, crearRng(semilla)),
      semilla,
    };
    const ultima = n === jugadas;
    ronda.partidas = ronda.partidas.map((p) => {
      if (!p.jugador2) return p;
      const pendiente = ultima && [p.jugador1.uid, p.jugador2.uid].some((u) => sinResultado.includes(u));
      return { ...p, resultado: pendiente ? null : RESULTADOS[Math.floor(rng() * RESULTADOS.length)] };
    });
    rondas.push(ronda);
  }
  return rondas;
}

interface TorneoCerrado {
  id: string;
  datos: Record<string, unknown>;
  entregados: PuestoPremio[];
}

function torneoCerrado(id: string, nombre: string, dia: Date, uids: readonly string[], semilla: number, entregados: readonly number[]): TorneoCerrado {
  const jugadores = inscriptos(uids);
  const rondas = jugarRondas(jugadores, 3, 3, semilla);
  const posiciones = posicionesFinales({ jugadores, rondas, formatoId: 'suizo' });
  const premios = asignarPremios(PREMIOS_BASE, posiciones).map((p) => ({ ...p, entregado: entregados.includes(p.puesto) }));
  const inicio = new Date(dia);
  inicio.setHours(19, 0, 0, 0);
  return {
    id,
    datos: {
      nombre,
      juego: 'Pokémon TCG',
      formatoId: 'suizo',
      formato: 'Suizo',
      totalRondas: 3,
      topCut: 0,
      minutosPorRonda: 50,
      minutosExtra: 3,
      inscripcion: 6000,
      cupo: 16,
      jugadores,
      jugadoresUids: jugadores.map((j) => j.uid),
      estado: 'finalizado',
      rondaActual: 3,
      rondas,
      premios,
      rondaFinEn: null,
      rondaRestanteMs: null,
      rondaPausada: false,
      fecha: fechaLocal(dia),
      posiciones,
      finalizadoEn: Timestamp.fromMillis(inicio.getTime() + 205 * MIN),
      creadoPor: JUEZ,
      creadoEn: Timestamp.fromMillis(inicio.getTime()),
    },
    entregados: premios.filter((p) => p.entregado),
  };
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

const PEDIDOS_TIPICOS: readonly (readonly [string, number][])[] = [
  [['cafe-cortado', 2], ['pas-medialuna', 3]],
  [['cafe-con-leche', 1], ['pas-tostado', 1]],
  [['cafe-capuccino', 2], ['pas-brownie', 1]],
  [['cafe-espresso', 1]],
  [['cafe-submarino', 2], ['pas-alfajor', 2]],
  [['mesa-alquiler', 2], ['mesa-agua', 1]],
  [['cafe-latte', 1], ['pas-cookie', 1]],
  [['tcg-sobre-pokemon', 3]],
  [['tcg-folios', 1], ['cafe-cortado', 1]],
  [['cafe-licuado', 1], ['pas-medialuna', 2]],
];
const MEDIOS: readonly MedioPago[] = ['efectivo', 'efectivo', 'debito', 'qr', 'transferencia', 'credito'];

interface VentaDemo {
  id: string;
  datos: Record<string, unknown>;
}

function ventas(ahora: Date): VentaDemo[] {
  const rng = crearRng(7);
  const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(rng() * lista.length)];
  const cafe = MESAS.filter((m) => m.tipo === 'cafe');
  const momentos: Date[] = [];
  // Hoy: una cada 25 minutos hacia atrás, sin pasar de la apertura del primer turno.
  const apertura = new Date(ahora);
  apertura.setHours(8, 0, 0, 0);
  for (let k = 1; k <= 9; k++) {
    const t = new Date(ahora.getTime() - k * 25 * MIN);
    if (t > apertura) momentos.push(t);
  }
  // Los seis días anteriores, para el gráfico y la comparación de Caja.
  for (let d = 1; d <= 6; d++) {
    const cantidad = 4 + Math.floor(rng() * 5);
    for (let k = 0; k < cantidad; k++) {
      const t = sumarDias(ahora, -d);
      t.setHours(9 + Math.floor(rng() * 13), Math.floor(rng() * 60), 0, 0);
      momentos.push(t);
    }
  }
  return momentos.map((t, i) => {
    const items = elegir(PEDIDOS_TIPICOS).map(([id, cantidad]) => item(id, cantidad));
    const m = elegir(cafe);
    const bruto = subtotal(items);
    // La venta más reciente la paga en parte Tomás con su crédito de premios: aparece en "Mi cuenta".
    const conCredito = i === 0;
    const creditoAplicado = conCredito ? Math.min(2000, bruto) : 0;
    return {
      id: `demo-venta-${String(i + 1).padStart(3, '0')}`,
      datos: {
        mesaId: m.id,
        mesaNum: m.numero,
        items,
        subtotal: bruto,
        creditoAplicado,
        creditoUid: conCredito ? JUGADOR : null,
        total: bruto - creditoAplicado,
        medioPago: conCredito ? 'efectivo' : elegir(MEDIOS),
        fecha: fechaDeNegocio(CONFIG_DEFAULT.turnos, t),
        hora: horaLocal(t),
        creadoPor: MOZO,
        creadoEn: Timestamp.fromDate(t),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

async function limpiar(): Promise<void> {
  const auth = await fetch(`http://${HOST}:${PUERTOS_DEMO.auth}/emulator/v1/projects/${PROYECTO_DEMO}/accounts`, { method: 'DELETE' });
  const firestore = await fetch(`http://${HOST}:${PUERTOS_DEMO.firestore}/emulator/v1/projects/${PROYECTO_DEMO}/databases/(default)/documents`, { method: 'DELETE' });
  if (!auth.ok || !firestore.ok) throw new Error('No se pudieron vaciar los emuladores antes de cargar los datos.');
}

async function crearCuenta(c: CuentaDemo): Promise<void> {
  const r = await fetch(`http://${HOST}:${PUERTOS_DEMO.auth}/identitytoolkit.googleapis.com/v1/projects/${PROYECTO_DEMO}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: c.uid, email: c.email, password: CLAVE_DEMO, displayName: c.nombre, emailVerified: true }),
  });
  if (!r.ok) throw new Error(`No se pudo crear la cuenta ${c.email}: ${await r.text()}`);
}

type Escritura = [ruta: string, datos: Record<string, unknown>];

function documentos(ahora: Date): Escritura[] {
  const ms = ahora.getTime();
  const hace = (min: number) => Timestamp.fromMillis(ms - min * MIN);
  const hoy = fechaDeNegocio(CONFIG_DEFAULT.turnos, ahora);
  const inicioTemporada = sumarDias(ahora, -21);
  const w: Escritura[] = [];

  w.push([
    'config/publico',
    {
      ...CONFIG_DEFAULT,
      nombreLocal: 'Duel',
      temporada: { nombre: 'Temporada de primavera', inicio: fechaLocal(inicioTemporada), inicioMs: inicioTemporada.getTime() },
    },
  ]);
  w.push(['config/privado', { codigoInvitacion: CODIGO_DEMO, codigoVenceEn: Timestamp.fromMillis(ms + 7 * DIA) }]);

  for (const c of CUENTAS_DEMO) {
    w.push([`users/${c.uid}`, { uid: c.uid, nombre: c.nombre, email: c.email, role: c.role, estadoAprobacion: 'aprobado', emailVerificado: true, creadoEn: hace(30 * 24 * 60) }]);
  }
  // Una solicitud esperando al admin, para ver Equipo con algo pendiente.
  w.push([
    'users/demo-pendiente',
    { uid: 'demo-pendiente', nombre: 'Bruno Medina', email: 'bruno@duel.test', role: 'mozo', estadoAprobacion: 'pendiente', codigoInvitacion: CODIGO_DEMO, emailVerificado: true, creadoEn: hace(90) },
  ]);

  for (const s of SALAS) w.push([`salas/${s.id}`, { nombre: s.nombre, orden: s.orden, creadoEn: hace(60 * 24 * 60) }]);
  for (const m of MESAS) {
    w.push([
      `mesas/${m.id}`,
      { numero: m.numero, x: m.x, y: m.y, salaId: m.salaId, tipo: m.tipo, estado: m.pedido.length > 0 ? 'consumo' : 'libre', pedido: m.pedido, creadoEn: hace(60 * 24 * 60) },
    ]);
  }

  for (const p of CARTA) {
    const conStock = p.stock !== null;
    w.push([
      `productos/${p.id}`,
      { nombre: p.nombre, precio: p.precio, rubro: p.rubro, controlStock: conStock, ...(conStock ? { stock: p.stock, unidad: 'u' } : {}), activo: true, creadoEn: hace(60 * 24 * 60) },
    ]);
  }
  for (const p of TCG) {
    w.push([`tcg_productos/${p.id}`, { nombre: p.nombre, valor: p.precio, stock: p.stock, unidad: 'u', activo: true, creadoEn: hace(60 * 24 * 60) }]);
  }
  w.push(['ingresos/demo-ingreso-1', { productoId: 'tcg-sobre-pokemon', coleccion: 'tcg_productos', nombre: 'Sobre Pokémon Escarlata y Púrpura', rubro: 'TCG', cantidad: 36, unidad: 'u', costoUnitario: 5200, fecha: hoy, creadoPor: ADMIN, creadoEn: hace(240) }]);
  w.push(['ingresos/demo-ingreso-2', { productoId: 'pas-medialuna', coleccion: 'productos', nombre: 'Medialuna', rubro: 'Pastelería', cantidad: 48, unidad: 'u', costoUnitario: 350, fecha: hoy, creadoPor: ADMIN, creadoEn: hace(200) }]);

  // Torneos cerrados: el de hace una semana con todo entregado, el de ayer con premios por entregar.
  const cerrados = [
    torneoCerrado('demo-torneo-semana', 'Liga Pokémon · Fecha 2', sumarDias(ahora, -7), ['demo-j-lucia', JUGADOR, 'demo-j-martin', 'demo-j-sofia', 'demo-j-julian', 'demo-j-valentina', 'demo-j-agustin', 'demo-j-micaela'], 300, [1, 2, 3]),
    torneoCerrado('demo-torneo-ayer', 'Liga Pokémon · Fecha 3', sumarDias(ahora, -1), [JUGADOR, 'demo-j-lucia', 'demo-j-martin', 'demo-j-sofia', 'demo-j-julian', 'demo-j-valentina', 'demo-j-agustin', 'demo-j-joaquin'], 700, [2]),
  ];
  const ultimoPremio = new Map<string, { torneoId: string; puesto: number }>();
  for (const t of cerrados) {
    w.push([`torneos/${t.id}`, t.datos]);
    for (const p of t.entregados) {
      w.push([
        `torneos/${t.id}/entregas/${p.puesto}`,
        { puesto: p.puesto, jugadorUid: p.jugadorUid, creditoCafeteria: p.creditoCafeteria, cantidadProducto: p.cantidadProducto, entregadoPor: JUEZ, entregadoEn: t.datos.finalizadoEn as Timestamp },
      ]);
      if (p.jugadorUid && p.creditoCafeteria > 0) ultimoPremio.set(p.jugadorUid, { torneoId: t.id, puesto: p.puesto });
    }
  }

  // Torneo en curso: ronda 2 con el reloj corriendo; la mesa de Tomás todavía sin resultado.
  const jugadoresHoy = inscriptos([JUGADOR, 'demo-j-lucia', 'demo-j-martin', 'demo-j-sofia', 'demo-j-julian', 'demo-j-valentina', 'demo-j-agustin', 'demo-j-micaela'], ['demo-j-micaela']);
  const rondasHoy = jugarRondas(jugadoresHoy, 4, 2, 900, [JUGADOR, 'demo-j-sofia']);
  w.push([
    'torneos/demo-torneo-hoy',
    {
      nombre: 'Modern semanal',
      juego: 'Magic',
      formatoId: 'suizo',
      formato: 'Suizo',
      totalRondas: 4,
      topCut: 0,
      minutosPorRonda: 50,
      minutosExtra: 3,
      inscripcion: 6000,
      cupo: 16,
      jugadores: jugadoresHoy,
      jugadoresUids: jugadoresHoy.map((j) => j.uid),
      estado: 'en_curso',
      rondaActual: 2,
      rondas: rondasHoy,
      premios: PREMIOS_BASE.map((p) => ({ ...p })),
      ...timerNuevaRonda(50, ms - 18 * MIN),
      fecha: hoy,
      creadoPor: JUEZ,
      creadoEn: hace(75),
    },
  ]);
  w.push(['bloqueos/torneo', { torneoId: 'demo-torneo-hoy', actualizadoEn: hace(75) }]);

  const lista = ventas(ahora);
  for (const v of lista) w.push([`ventas/${v.id}`, v.datos]);
  const ventaConCredito = lista[0]?.id;

  for (const j of JUGADORES) {
    w.push([
      `jugadores/${j.uid}`,
      {
        uid: j.uid,
        nombre: j.nombre,
        nombreBusqueda: normalizarBusqueda(j.nombre),
        creditoCafeteria: j.credito,
        activo: true,
        ...(j.uid === JUGADOR && ventaConCredito ? { ultimaVenta: ventaConCredito } : {}),
        ...(ultimoPremio.has(j.uid) ? { ultimoPremio: ultimoPremio.get(j.uid) } : {}),
        creadoEn: hace(40 * 24 * 60),
      },
    ]);
  }
  return w;
}

/** Vacía los emuladores y carga todo de nuevo. Devuelve cuántos documentos escribió. */
export async function sembrarDemo(ahora: Date = new Date()): Promise<number> {
  await limpiar();
  for (const c of CUENTAS_DEMO) await crearCuenta(c);

  const env = await initializeTestEnvironment({ projectId: PROYECTO_DEMO, firestore: { host: HOST, port: PUERTOS_DEMO.firestore } });
  const escrituras = documentos(ahora);
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      for (let i = 0; i < escrituras.length; i += 400) {
        const batch = writeBatch(db);
        for (const [ruta, datos] of escrituras.slice(i, i + 400)) batch.set(doc(db, ruta), datos);
        await batch.commit();
      }
    });
  } finally {
    await env.cleanup();
  }
  return escrituras.length;
}
