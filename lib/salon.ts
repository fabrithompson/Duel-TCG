import type { CatalogoItem, ItemPedido, MedioPago, OrigenItem, Rubro } from './pedido';
import { RUBROS, coleccionDe } from './pedido';
import { formatTimer } from './torneo';
import type { Partida, Torneo } from './torneo';

// Sin Firebase a propósito: Salón y Pedido comparten esta lógica y se testea en Jest.

export type TipoMesa = 'cafe' | 'duelo';

export const MARGEN_LIENZO = 10;
export const ALTO_MESA = 66;

const ANCHO_MESA: Record<TipoMesa, { fraccion: number; min: number; max: number }> = {
  cafe: { fraccion: 0.26, min: 72, max: 120 },
  duelo: { fraccion: 0.42, min: 104, max: 180 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

export function tamanoMesa(tipo: TipoMesa, anchoLienzo: number): { ancho: number; alto: number } {
  const r = ANCHO_MESA[tipo];
  return { ancho: Math.round(clamp(anchoLienzo * r.fraccion, r.min, r.max)), alto: ALTO_MESA };
}

// Docs viejos guardaban píxeles absolutos; los nuevos, fracción 0..1 del lienzo.
export function esFraccion(coord: number): boolean {
  return Number.isFinite(coord) && coord >= 0 && coord <= 1;
}

// La fracción se mide sobre el espacio libre (lienzo − mesa − márgenes) para que ninguna mesa quede cortada en pantallas chicas.
export function aPixeles(coord: number, lienzo: number, tamano: number, margen = MARGEN_LIENZO): number {
  const libre = Math.max(0, lienzo - tamano - 2 * margen);
  if (!Number.isFinite(coord)) return margen;
  if (esFraccion(coord)) return margen + coord * libre;
  return clamp(coord, 0, Math.max(0, lienzo - tamano));
}

export function aFraccion(px: number, lienzo: number, tamano: number, margen = MARGEN_LIENZO): number {
  const libre = Math.max(0, lienzo - tamano - 2 * margen);
  if (libre === 0 || !Number.isFinite(px)) return 0;
  return redondear(clamp((px - margen) / libre, 0, 1), 4);
}

export interface PuntoFraccion {
  x: number;
  y: number;
}

const CANDIDATOS: readonly PuntoFraccion[] = [0, 1 / 3, 2 / 3, 1].flatMap((y) =>
  [0, 0.5, 1].map((x) => ({ x: redondear(x, 4), y: redondear(y, 4) }))
);

export function posicionLibre(ocupadas: readonly PuntoFraccion[]): PuntoFraccion {
  const lejos = (c: PuntoFraccion) => ocupadas.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 0.2);
  return CANDIDATOS.find(lejos) ?? { x: 0.5, y: 0.5 };
}

export function siguienteNumeroMesa(mesas: readonly { numero: number }[]): number {
  return mesas.reduce((max, m) => (Number.isFinite(m.numero) && m.numero > max ? m.numero : max), 0) + 1;
}

export function numeroMesaTexto(numero: number): string {
  return String(numero).padStart(2, '0');
}

export interface DueloEnMesa {
  ronda: number;
  partida: Partida;
}

type TorneoParaDuelos = Pick<Torneo, 'estado' | 'rondaActual' | 'rondas'>;

// El duelo no se guarda en la mesa: se deriva del torneo para que nunca quede "colgado" si alguien cierra la app.
export function duelosPorMesa(torneo: TorneoParaDuelos | null | undefined): Map<string, DueloEnMesa> {
  const mapa = new Map<string, DueloEnMesa>();
  if (!torneo || torneo.estado !== 'en_curso' || !Array.isArray(torneo.rondas)) return mapa;
  const ronda = torneo.rondas.find((r) => r && r.numero === torneo.rondaActual);
  if (!ronda || !Array.isArray(ronda.partidas)) return mapa;
  for (const partida of ronda.partidas) {
    if (partida && typeof partida.mesaSalonId === 'string' && partida.mesaSalonId && partida.resultado === null) {
      mapa.set(partida.mesaSalonId, { ronda: ronda.numero, partida });
    }
  }
  return mapa;
}

export function etiquetaDuelo(ronda: number, segundos: number): string {
  return segundos > 0 ? `R${ronda} · ${formatTimer(segundos)}` : `R${ronda} · tiempo`;
}

export function contarSalon(
  mesas: readonly { id: string; estado: string }[],
  duelos: ReadonlyMap<string, DueloEnMesa>
): { ocupadas: number; enDuelo: number } {
  let ocupadas = 0;
  let enDuelo = 0;
  for (const m of mesas) {
    const duelo = duelos.has(m.id);
    if (duelo) enDuelo += 1;
    if (duelo || m.estado !== 'libre') ocupadas += 1;
  }
  return { ocupadas, enDuelo };
}

const ORIGENES: readonly OrigenItem[] = ['productos', 'tcg'];

// El pedido de la mesa lo escriben varios dispositivos (y versiones viejas de la app): no se confía en su forma.
export function normalizarLineas(raw: unknown): ItemPedido[] {
  if (!Array.isArray(raw)) return [];
  const lineas: ItemPedido[] = [];
  for (const l of raw) {
    if (!l || typeof l !== 'object') continue;
    const r = l as Record<string, unknown>;
    if (typeof r.itemId !== 'string' || !r.itemId) continue;
    const cantidad = typeof r.cantidad === 'number' && Number.isFinite(r.cantidad) ? Math.round(r.cantidad) : 0;
    if (cantidad < 1) continue;
    lineas.push({
      itemId: r.itemId,
      nombre: typeof r.nombre === 'string' && r.nombre ? r.nombre : 'Sin nombre',
      precio: typeof r.precio === 'number' && Number.isFinite(r.precio) ? r.precio : 0,
      cantidad,
      rubro: typeof r.rubro === 'string' && (RUBROS as readonly string[]).includes(r.rubro) ? (r.rubro as Rubro) : 'Café',
      origen: typeof r.origen === 'string' && (ORIGENES as readonly string[]).includes(r.origen) ? (r.origen as OrigenItem) : 'productos',
    });
  }
  return lineas;
}

// Un doc de productos y uno de tcg_productos podrían compartir id: la línea se identifica por los dos.
function claveLinea(l: Pick<ItemPedido, 'itemId' | 'origen'>): string {
  return `${l.origen}:${l.itemId}`;
}

export function mismoPedido(a: readonly ItemPedido[], b: readonly ItemPedido[]): boolean {
  if (a.length !== b.length) return false;
  const firma = (l: ItemPedido) => `${claveLinea(l)}|${l.cantidad}|${l.precio}`;
  const fa = a.map(firma).sort();
  const fb = b.map(firma).sort();
  return fa.every((f, i) => f === fb[i]);
}

export function cantidadEnCuenta(cuenta: readonly ItemPedido[], item: Pick<CatalogoItem, 'id' | 'origen'>): number {
  const clave = claveLinea({ itemId: item.id, origen: item.origen });
  return cuenta.reduce((acc, l) => (claveLinea(l) === clave ? acc + l.cantidad : acc), 0);
}

export function puedeAgregar(item: Pick<CatalogoItem, 'stock'>, enCuenta: number): boolean {
  return item.stock === null || enCuenta < item.stock;
}

export function agregarItem(cuenta: readonly ItemPedido[], item: CatalogoItem): ItemPedido[] {
  const clave = claveLinea({ itemId: item.id, origen: item.origen });
  if (cuenta.some((l) => claveLinea(l) === clave)) {
    return cuenta.map((l) => (claveLinea(l) === clave ? { ...l, cantidad: l.cantidad + 1 } : l));
  }
  return [...cuenta, { itemId: item.id, nombre: item.nombre, precio: item.precio, cantidad: 1, rubro: item.rubro, origen: item.origen }];
}

export function cambiarCantidad(cuenta: readonly ItemPedido[], linea: Pick<ItemPedido, 'itemId' | 'origen'>, delta: number): ItemPedido[] {
  const clave = claveLinea(linea);
  return cuenta
    .map((l) => (claveLinea(l) === clave ? { ...l, cantidad: l.cantidad + delta } : l))
    .filter((l) => l.cantidad > 0);
}

export function buscarEnCatalogo(catalogo: readonly CatalogoItem[], linea: Pick<ItemPedido, 'itemId' | 'origen'>): CatalogoItem | undefined {
  return catalogo.find((c) => c.id === linea.itemId && c.origen === linea.origen);
}

export interface DescuentoStock {
  coleccion: 'productos' | 'tcg_productos';
  id: string;
  cantidad: number;
}

// Una escritura por producto: un batch con dos increment al mismo doc es válido pero ensucia las reglas y el log.
export function descuentosDeStock(
  cuenta: readonly ItemPedido[],
  catalogo: readonly CatalogoItem[]
): { descuentos: DescuentoStock[]; huerfanas: ItemPedido[] } {
  const porProducto = new Map<string, DescuentoStock>();
  const huerfanas: ItemPedido[] = [];
  for (const linea of cuenta) {
    const producto = buscarEnCatalogo(catalogo, linea);
    if (!producto) {
      huerfanas.push(linea);
      continue;
    }
    if (producto.stock === null) continue;
    const clave = claveLinea(linea);
    const previo = porProducto.get(clave);
    porProducto.set(clave, {
      coleccion: coleccionDe(producto.origen),
      id: producto.id,
      cantidad: (previo?.cantidad ?? 0) + linea.cantidad,
    });
  }
  return { descuentos: [...porProducto.values()], huerfanas };
}

// Redondeo hacia abajo en los dos: las reglas rechazan crédito mayor al subtotal o que deje el saldo del jugador negativo.
export function creditoAplicable(credito: number, subtotal: number): number {
  if (!Number.isFinite(credito) || !Number.isFinite(subtotal)) return 0;
  return Math.max(0, Math.min(Math.floor(credito), Math.floor(subtotal)));
}

export function medioDePagoFinal(total: number, elegido: MedioPago | null): MedioPago | null {
  if (total <= 0) return 'credito_torneo';
  return elegido === 'credito_torneo' ? null : elegido;
}

export function normalizarBusqueda(texto: string): string {
  const base = texto.trim().toLowerCase();
  return typeof base.normalize === 'function' ? base.normalize('NFD').replace(/[̀-ͯ]/g, '') : base;
}

export function coincideBusqueda(nombre: string, busqueda: string): boolean {
  const b = normalizarBusqueda(busqueda);
  return !b || normalizarBusqueda(nombre).includes(b);
}

// Sin conexión, Firestore aplica la escritura localmente pero no resuelve la promesa hasta reconectar: no se deja al mozo esperando.
export async function esperarConfirmacion(
  escritura: Promise<unknown>,
  ms: number,
  onErrorTardio: (error: unknown) => void
): Promise<'confirmado' | 'pendiente'> {
  let vencido = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<'pendiente'>((resolve) => {
    timer = setTimeout(() => {
      vencido = true;
      resolve('pendiente');
    }, ms);
  });
  const confirmada = escritura.then(
    () => 'confirmado' as const,
    (error: unknown) => {
      if (!vencido) throw error;
      onErrorTardio(error);
      return 'pendiente' as const;
    }
  );
  try {
    return await Promise.race([confirmada, tope]);
  } finally {
    clearTimeout(timer);
  }
}
