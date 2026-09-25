import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CatalogoItem, Rubro, Unidad, UNIDADES } from '../lib/pedido';

/** El rubro guardado (lo define el local); los docs viejos con `categoria` se mapean al rubro nuevo. */
function rubroDe(data: Record<string, unknown>): Rubro {
  if (typeof data.rubro === 'string' && data.rubro.trim()) return data.rubro.trim().slice(0, 30);
  return data.categoria === 'Bebidas' ? 'Café' : 'Pastelería';
}

function unidadDe(valor: unknown): Unidad {
  return typeof valor === 'string' && (UNIDADES as readonly string[]).includes(valor) ? (valor as Unidad) : 'u';
}

function numero(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : fallback;
}

export function normalizarProducto(id: string, data: Record<string, unknown>): CatalogoItem {
  // Docs viejos con controlStock pero sin número de stock: se tratan como sin control (vendibles),
  // en vez de mostrarlos 'sin stock' y que las reglas rechacen descontarles.
  const controla = data.controlStock === true && typeof data.stock === 'number' && Number.isFinite(data.stock);
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
  reintentar: () => void;
}

/**
 * Catálogo unificado: `productos` (cafetería, pastelería, servicios de mesa) +
 * `tcg_productos` (TCG). Pedido, Stock y Premios leen todo de acá.
 */
export function useCatalogo(): UseCatalogoResult {
  const [productos, setProductos] = useState<CatalogoItem[]>([]);
  const [tcg, setTcg] = useState<CatalogoItem[]>([]);
  const [loaded, setLoaded] = useState({ productos: false, tcg: false });
  const [errores, setErrores] = useState<{ productos: unknown; tcg: unknown }>({ productos: null, tcg: null });
  // Las pestañas no se desmontan: sin reintento, un error de red dejaba el catálogo roto hasta reiniciar la app.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'productos'),
      (snap) => {
        setProductos(snap.docs.map((d) => normalizarProducto(d.id, d.data())));
        setErrores((p) => ({ ...p, productos: null }));
        setLoaded((p) => ({ ...p, productos: true }));
      },
      (e) => {
        setErrores((p) => ({ ...p, productos: e }));
        setLoaded((p) => ({ ...p, productos: true }));
      }
    );
    return unsub;
  }, [intento]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tcg_productos'),
      (snap) => {
        setTcg(snap.docs.map((d) => normalizarProductoTcg(d.id, d.data())));
        setErrores((p) => ({ ...p, tcg: null }));
        setLoaded((p) => ({ ...p, tcg: true }));
      },
      (e) => {
        setErrores((p) => ({ ...p, tcg: e }));
        setLoaded((p) => ({ ...p, tcg: true }));
      }
    );
    return unsub;
  }, [intento]);

  // Memoizado: un array nuevo en cada render invalidaba todos los useMemo de Pedido, Stock y Premios.
  const items = useMemo(() => [...productos, ...tcg].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [productos, tcg]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { items, loading: !loaded.productos || !loaded.tcg, error: errores.productos ?? errores.tcg, reintentar };
}
