// Catálogo, pedidos y ventas.
//
// Colecciones:
//  - `productos`: cafetería, pastelería y servicios de mesa.
//      { nombre, precio, rubro: Rubro, controlStock: boolean, stock?: number, unidad?: Unidad,
//        alerta?: number, activo?: boolean, creadoEn }
//    Los servicios (rubro 'Mesa': alquiler, inscripción, agua…) van con controlStock=false.
//    Docs viejos pueden tener `categoria` ('Bebidas'|'Comidas'|'Postres') en vez de `rubro`.
//  - `tcg_productos`: sellado y accesorios TCG (colección heredada, se mantiene por compatibilidad).
//      { nombre, valor (precio), stock, unidad?, alerta?, activo?, creadoEn }
//  - `ventas`: una por cobro, inmutable.
//      { mesaId, mesaNum, items: ItemPedido[], subtotal, creditoAplicado, creditoUid|null,
//        total (lo cobrado en caja = subtotal - creditoAplicado), medioPago: MedioPago,
//        fecha (YYYY-MM-DD local), hora (HH:MM local), creadoPor (uid), creadoEn }
//  - `ingresos`: una por ingreso de mercadería (solo admin).
//      { productoId, coleccion, nombre, rubro, cantidad, unidad, costoUnitario, fecha, creadoPor, creadoEn }

export type Rubro = 'Café' | 'Pastelería' | 'TCG' | 'Mesa';

export const RUBROS: readonly Rubro[] = ['Café', 'Pastelería', 'TCG', 'Mesa'];

/** Colección de Firestore de la que viene un ítem del catálogo. */
export type OrigenItem = 'productos' | 'tcg';

export type Unidad = 'u' | 'kg' | 'L' | 'pack';
export const UNIDADES: readonly Unidad[] = ['u', 'kg', 'L', 'pack'];

export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'qr' | 'credito_torneo';

export const MEDIOS_PAGO: readonly { id: MedioPago; nombre: string }[] = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'debito', nombre: 'Débito' },
  { id: 'credito', nombre: 'Crédito' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'qr', nombre: 'QR' },
];

export interface CatalogoItem {
  id: string;
  nombre: string;
  precio: number;
  rubro: Rubro;
  origen: OrigenItem;
  /** null = no trackea stock (servicios, o producto sin control de stock). */
  stock: number | null;
  unidad: Unidad;
  /** Umbral propio de stock bajo; null = usa `config.alertaStock`. */
  alerta: number | null;
  activo: boolean;
}

export interface ItemPedido {
  itemId: string;
  nombre: string;
  precio: number;
  cantidad: number;
  rubro: Rubro;
  origen: OrigenItem;
}

export interface Venta {
  id: string;
  mesaId: string;
  mesaNum: number;
  items: ItemPedido[];
  subtotal: number;
  creditoAplicado: number;
  creditoUid: string | null;
  total: number;
  medioPago: MedioPago;
  fecha: string;
  hora: string;
  creadoPor: string;
}

export function coleccionDe(origen: OrigenItem): 'productos' | 'tcg_productos' {
  return origen === 'tcg' ? 'tcg_productos' : 'productos';
}

export function subtotalDe(items: readonly ItemPedido[]): number {
  return items.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
}

/** Stock en o por debajo del umbral (propio del producto o el general del local). */
export function stockBajo(item: Pick<CatalogoItem, 'stock' | 'alerta'>, alertaLocal: number): boolean {
  if (item.stock === null) return false;
  return item.stock <= (item.alerta ?? alertaLocal);
}

/** $12.400 — separador de miles con punto, sin decimales (formato es-AR sin depender de Intl). */
export function formatARS(n: number): string {
  const redondeado = Math.round(Number.isFinite(n) ? n : 0);
  const signo = redondeado < 0 ? '-' : '';
  const miles = String(Math.abs(redondeado)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${miles}`;
}

/** Cantidad con unidad: "4,2 kg", "18 L", "12 u". */
export function formatCantidad(n: number, unidad: Unidad): string {
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${texto} ${unidad}`;
}
