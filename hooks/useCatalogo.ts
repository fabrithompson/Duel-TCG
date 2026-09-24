import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CatalogoItem, Rubro, Unidad, UNIDADES } from '../lib/pedido';

const RUBROS_VALIDOS: readonly string[] = ['Café', 'Pastelería', 'TCG', 'Mesa'];

/** Mapeo de las categorías viejas de cafetería al rubro nuevo. */
function rubroDe(data: Record<string, unknown>): Rubro {
  if (typeof data.rubro === 'string' && RUBROS_VALIDOS.includes(data.rubro)) return data.rubro as Rubro;
  return data.categoria === 'Bebidas' ? 'Café' : 'Pastelería';
}

function unidadDe(valor: unknown): Unidad {
  return typeof valor === 'string' && (UNIDADES as readonly string[]).includes(valor) ? (valor as Unidad) : 'u';
}

function numero(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : fallback;
}

export function normalizarProducto(id: string, data: Record<string, unknown>): CatalogoItem {
  const controla = data.controlStock === true;
  return {
    id,
    nombre: typeof data.nombre === 'string' ? data.nombre : 'Sin nombre',
    precio: numero(data.precio, 0),
    rubro: rubroDe(data),
    origen: 'productos',
    stock: controla ? numero(data.stock, 0) : null,
    unidad: unidadDe(data.unidad),
    alerta: typeof data.alerta === 'number' ? data.alerta : null,
    activo: data.activo !== false,
  };
}

export function normalizarProductoTcg(id: string, data: Record<string, unknown>): CatalogoItem {
  return {
    id,
    nombre: typeof data.nombre === 'string' ? data.nombre : 'Sin nombre',
    precio: numero(data.valor, 0),
    rubro: 'TCG',
    origen: 'tcg',
    stock: numero(data.stock, 0),
    unidad: unidadDe(data.unidad),
    alerta: typeof data.alerta === 'number' ? data.alerta : null,
    activo: data.activo !== false,
  };
}

interface UseCatalogoResult {
  /** Todos los ítems (incluye inactivos: Stock los muestra, Pedido los filtra). */
  items: CatalogoItem[];
  loading: boolean;
  error: unknown;
}

/**
 * Catálogo unificado: `productos` (cafetería, pastelería, servicios de mesa) +
 * `tcg_productos` (TCG). Pedido, Stock y Premios leen todo de acá.
 */
export function useCatalogo(): UseCatalogoResult {
  const [productos, setProductos] = useState<CatalogoItem[]>([]);
  const [tcg, setTcg] = useState<CatalogoItem[]>([]);
  const [loaded, setLoaded] = useState({ productos: false, tcg: false });
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'productos'),
      (snap) => {
        setProductos(snap.docs.map((d) => normalizarProducto(d.id, d.data())));
        setLoaded((p) => ({ ...p, productos: true }));
      },
      (e) => {
        setError(e);
        setLoaded((p) => ({ ...p, productos: true }));
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tcg_productos'),
      (snap) => {
        setTcg(snap.docs.map((d) => normalizarProductoTcg(d.id, d.data())));
        setLoaded((p) => ({ ...p, tcg: true }));
      },
      (e) => {
        setError(e);
        setLoaded((p) => ({ ...p, tcg: true }));
      }
    );
    return unsub;
  }, []);

  const items = [...productos, ...tcg].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { items, loading: !loaded.productos || !loaded.tcg, error };
}
