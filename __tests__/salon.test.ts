import React, { act } from 'react';
import { Alert } from 'react-native';
import { CONFIG_DEFAULT, ConfigLocal } from '../lib/config';
import { fechaLocal } from '../lib/fecha';
import type { CatalogoItem, ItemPedido } from '../lib/pedido';
import SalonScreen from '../app/(tabs)/salon/index';
import PedidoScreen from '../app/(tabs)/salon/pedido';
import {
  ALTO_MESA,
  MARGEN_LIENZO,
  aFraccion,
  aPixeles,
  agregarItem,
  cambiarCantidad,
  cantidadEnCuenta,
  coincideBusqueda,
  contarSalon,
  creditoAplicable,
  descuentosDeStock,
  duelosPorMesa,
  esFraccion,
  esperarConfirmacion,
  etiquetaDuelo,
  medioDePagoFinal,
  mismoPedido,
  normalizarLineas,
  lineasAgregadas,
  numeroMesaTexto,
  posicionLibre,
  puedeAgregar,
  siguienteNumeroMesa,
  tamanoMesa,
} from '../lib/salon';
import type { Partida, Ronda, Torneo } from '../lib/torneo';

// Pruebas de QA: funciones puras del salón y las pantallas Salón y Pedido con Firebase simulado.

interface NodoPrueba {
  type: unknown;
  props: Record<string, unknown>;
  findAll(pred: (n: NodoPrueba) => boolean): NodoPrueba[];
}

interface RenderPrueba {
  root: NodoPrueba;
  toJSON(): unknown;
  unmount(): void;
}

// Sin @types/react-test-renderer instalado: se tipa acá lo poco que se usa.
const renderer: { create(el: React.ReactElement): RenderPrueba } = require('react-test-renderer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Filtro = { campo: string; op: string; valor: unknown } | { tipo: 'orden'; campo: string; dir?: string } | { tipo: 'limite'; n: number };
type RefFalsa = { tipo: 'doc'; path: string } | { tipo: 'col'; nombre: string } | { tipo: 'query'; nombre: string; filtros: Filtro[] };
type DocFalso = { id: string } & Record<string, unknown>;
interface OpBatch {
  op: 'set' | 'update' | 'delete';
  path: string;
  datos?: Record<string, unknown>;
}

const mockColecciones: Record<string, DocFalso[]> = {};
const mockDocs: Record<string, Record<string, unknown> | null> = {};
const mockEscuchas = new Map<string, (snap: unknown) => void>();
// Cada batch o transacción confirmada deja acá sus escrituras, en orden.
const mockBatches: OpBatch[][] = [];
// Error con el que falla la próxima transacción (p. ej. sin conexión).
let mockFallaTransaccion: unknown = null;
const mockDispatch = jest.fn();
const mockPrevenir: { activo: boolean; alSalir: ((e: { data: { action: unknown } }) => void) | null } = { activo: false, alSalir: null };
const mockUpdateDoc = jest.fn((_path: string, _datos: Record<string, unknown>) => Promise.resolve());
const mockMostrar = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockAuto = 0;
let mockParams: Record<string, string> = { mesaId: 'm1' };
let mockConfig: ConfigLocal = CONFIG_DEFAULT;
let mockPerfil = { uid: 'yo', nombre: 'Lu', email: 'lu@duel.com', role: 'mozo', estadoAprobacion: 'aprobado' };
let mockTorneo: Torneo | null = null;

function mockSnapDoc(path: string) {
  const datos = mockDocs[path] ?? null;
  return { id: path.split('/')[1], exists: () => datos !== null, data: () => datos ?? undefined, metadata: { fromCache: false } };
}

function mockCumple(d: Record<string, unknown>, f: { campo: string; op: string; valor: unknown }): boolean {
  const v = d[f.campo] as number | string | undefined;
  const w = f.valor as number | string;
  if (v === undefined) return false;
  if (f.op === '==') return v === w;
  if (f.op === '>') return v > w;
  if (f.op === '>=') return v >= w;
  if (f.op === '<=') return v <= w;
  if (f.op === '<') return v < w;
  return true;
}

function mockSnapCol(nombre: string, filtros: Filtro[] = []) {
  let lista = mockColecciones[nombre] ?? [];
  for (const f of filtros) {
    if ('op' in f) lista = lista.filter((d) => mockCumple(d, f));
    else if (f.tipo === 'orden') {
      const signo = f.dir === 'desc' ? -1 : 1;
      lista = [...lista].sort((a, b) => ((a[f.campo] as number) > (b[f.campo] as number) ? signo : -signo));
    } else lista = lista.slice(0, f.n);
  }
  return { docs: lista.map(({ id, ...datos }) => ({ id, ref: { tipo: 'doc', path: `${nombre}/${id}` }, data: () => datos })) };
}

jest.mock('../config/firebase', () => ({ db: {}, auth: {}, storage: {} }));

jest.mock('firebase/firestore', () => ({
  doc: (base: unknown, ...partes: string[]) => {
    if (base && typeof base === 'object' && (base as { tipo?: string }).tipo === 'col') {
      mockAuto += 1;
      return { tipo: 'doc', path: `${(base as { nombre: string }).nombre}/auto${mockAuto}`, id: `auto${mockAuto}` };
    }
    return { tipo: 'doc', path: partes.join('/'), id: partes[partes.length - 1] };
  },
  collection: (_db: unknown, nombre: string) => ({ tipo: 'col', nombre }),
  query: (col: { nombre: string }, ...filtros: unknown[]) => ({ tipo: 'query', nombre: col.nombre, filtros }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  orderBy: (campo: string, dir?: string) => ({ tipo: 'orden', campo, dir }),
  limit: (n: number) => ({ tipo: 'limite', n }),
  onSnapshot: (ref: RefFalsa, next: (snap: unknown) => void) => {
    const clave = ref.tipo === 'doc' ? ref.path : ref.nombre;
    mockEscuchas.set(clave, next);
    next(ref.tipo === 'doc' ? mockSnapDoc(ref.path) : mockSnapCol(ref.nombre, ref.tipo === 'query' ? ref.filtros : []));
    return () => {
      if (mockEscuchas.get(clave) === next) mockEscuchas.delete(clave);
    };
  },
  updateDoc: (ref: { path: string }, datos: Record<string, unknown>) => mockUpdateDoc(ref.path, datos),
  setDoc: () => Promise.resolve(),
  deleteDoc: () => Promise.resolve(),
  getDocs: (ref: RefFalsa) => Promise.resolve(mockSnapCol(ref.tipo === 'doc' ? ref.path : ref.nombre)),
  writeBatch: () => {
    const ops: OpBatch[] = [];
    mockBatches.push(ops);
    return {
      set: (ref: { path: string }, datos: Record<string, unknown>) => ops.push({ op: 'set', path: ref.path, datos }),
      update: (ref: { path: string }, datos: Record<string, unknown>) => ops.push({ op: 'update', path: ref.path, datos }),
      delete: (ref: { path: string }) => ops.push({ op: 'delete', path: ref.path }),
      commit: () => Promise.resolve(),
    };
  },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    if (mockFallaTransaccion) throw mockFallaTransaccion;
    const ops: OpBatch[] = [];
    const tx = {
      get: (ref: { path: string }) => Promise.resolve(mockSnapDoc(ref.path)),
      set: (ref: { path: string }, datos: Record<string, unknown>) => (ops.push({ op: 'set', path: ref.path, datos }), tx),
      update: (ref: { path: string }, datos: Record<string, unknown>) => (ops.push({ op: 'update', path: ref.path, datos }), tx),
      delete: (ref: { path: string }) => (ops.push({ op: 'delete', path: ref.path }), tx),
    };
    const resultado = await fn(tx);
    mockBatches.push(ops);
    return resultado;
  },
  increment: (n: number) => ({ incremento: n }),
  serverTimestamp: () => 'TS',
}));

// Estable entre renders, como el router real.
const mockRouter = {
  push: (...a: unknown[]) => mockPush(...a),
  back: () => mockBack(),
  navigate: () => undefined,
  canDismiss: () => true,
  dismissTo: () => undefined,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-router/react-navigation', () => ({
  NavigationContext: jest.requireActual<typeof import('react')>('react').createContext(undefined),
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: (activo: boolean, alSalir: (e: { data: { action: unknown } }) => void) => {
    mockPrevenir.activo = activo;
    mockPrevenir.alSalir = alSalir;
  },
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../contexts/UserProfileContext', () => ({
  useUserProfileContext: () => ({ user: { uid: mockPerfil.uid }, profile: mockPerfil, loading: false }),
}));

jest.mock('../contexts/ConfigContext', () => ({
  useConfig: () => ({ config: mockConfig, cargando: false, guardarConfig: jest.fn() }),
}));

jest.mock('../contexts/ThemeContext', () => {
  const { getTheme } = jest.requireActual<typeof import('../constants/theme')>('../constants/theme');
  const colors = getTheme('day');
  return { useTheme: () => ({ mode: 'day', colors, preferencia: 'auto', setPreferencia: () => undefined, toggleMode: () => undefined }) };
});

jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ mostrar: mockMostrar }) }));

jest.mock('../hooks/useUltimoTorneo', () => ({
  useUltimoTorneo: () => ({ torneo: mockTorneo, loading: false, error: null, reintentar: () => undefined }),
}));

function producto(parcial: Partial<CatalogoItem> & Pick<CatalogoItem, 'id'>): CatalogoItem {
  return {
    nombre: `Producto ${parcial.id}`,
    precio: 1000,
    rubro: 'Café',
    origen: 'productos',
    stock: 10,
    unidad: 'u',
    alerta: null,
    activo: true,
    ...parcial,
  };
}

function linea(parcial: Partial<ItemPedido> & Pick<ItemPedido, 'itemId'>): ItemPedido {
  return { nombre: parcial.itemId, precio: 1000, cantidad: 1, rubro: 'Café', origen: 'productos', ...parcial };
}

function partida(parcial: Partial<Partida>): Partida {
  return {
    mesa: 1,
    jugador1: { uid: 'a', nombre: 'Ana', pagado: true },
    jugador2: { uid: 'b', nombre: 'Beto', pagado: true },
    resultado: null,
    ...parcial,
  };
}

type TorneoDuelos = Pick<Torneo, 'estado' | 'rondaActual' | 'rondas'>;

function torneo(rondas: Ronda[], rondaActual = 1, estado: Torneo['estado'] = 'en_curso'): TorneoDuelos {
  return { estado, rondaActual, rondas };
}

describe('tamanoMesa', () => {
  it('la mesa de duelo es más ancha que la de café y el alto es fijo', () => {
    const cafe = tamanoMesa('cafe', 330);
    const duelo = tamanoMesa('duelo', 330);
    expect(duelo.ancho).toBeGreaterThan(cafe.ancho);
    expect(cafe.alto).toBe(ALTO_MESA);
    expect(duelo.alto).toBe(ALTO_MESA);
  });

  it('respeta mínimos en pantallas chicas (objetivo táctil) y máximos en tablets', () => {
    expect(tamanoMesa('cafe', 100).ancho).toBe(72);
    expect(tamanoMesa('cafe', 2000).ancho).toBe(120);
    expect(tamanoMesa('duelo', 100).ancho).toBe(104);
    expect(tamanoMesa('duelo', 2000).ancho).toBe(180);
  });
});

describe('coordenadas del lienzo', () => {
  const lienzo = 320;
  const mesa = 80;
  const libre = lienzo - mesa - 2 * MARGEN_LIENZO;

  it('reconoce fracciones y píxeles viejos', () => {
    expect(esFraccion(0)).toBe(true);
    expect(esFraccion(0.42)).toBe(true);
    expect(esFraccion(1)).toBe(true);
    expect(esFraccion(18)).toBe(false);
    expect(esFraccion(-0.1)).toBe(false);
    expect(esFraccion(Number.NaN)).toBe(false);
  });

  it('una fracción ubica la mesa dentro del espacio libre, sin cortarla', () => {
    expect(aPixeles(0, lienzo, mesa)).toBe(MARGEN_LIENZO);
    expect(aPixeles(1, lienzo, mesa)).toBe(MARGEN_LIENZO + libre);
    expect(aPixeles(0.5, lienzo, mesa)).toBe(MARGEN_LIENZO + libre / 2);
    expect(aPixeles(1, lienzo, mesa) + mesa).toBeLessThanOrEqual(lienzo);
  });

  it('un doc viejo en píxeles se respeta y se recorta si no entra en la pantalla', () => {
    expect(aPixeles(118, lienzo, mesa)).toBe(118);
    expect(aPixeles(900, lienzo, mesa)).toBe(lienzo - mesa);
    expect(aPixeles(-30, lienzo, mesa)).toBe(0);
  });

  it('un valor corrupto cae al margen', () => {
    expect(aPixeles(Number.NaN, lienzo, mesa)).toBe(MARGEN_LIENZO);
  });

  it('aFraccion es la inversa de aPixeles', () => {
    for (const f of [0, 0.25, 0.3333, 0.5, 0.9, 1]) {
      expect(aFraccion(aPixeles(f, lienzo, mesa), lienzo, mesa)).toBeCloseTo(f, 3);
    }
  });

  it('la misma fracción se ve en el mismo lugar relativo en pantallas distintas', () => {
    const chica = aFraccion(aPixeles(0.7, 320, 80), 320, 80);
    const grande = aFraccion(aPixeles(0.7, 700, 80), 700, 80);
    expect(chica).toBeCloseTo(grande, 3);
  });

  it('recorta fuera de rango y no divide por cero', () => {
    expect(aFraccion(-50, lienzo, mesa)).toBe(0);
    expect(aFraccion(5000, lienzo, mesa)).toBe(1);
    expect(aFraccion(10, 80, 80)).toBe(0);
    expect(aFraccion(Number.NaN, lienzo, mesa)).toBe(0);
  });

  it('guarda con 4 decimales como máximo', () => {
    const f = aFraccion(123.456789, lienzo, mesa);
    expect(Math.round(f * 10000) / 10000).toBe(f);
  });

  it('convierte un doc viejo en píxeles a fracción al moverlo', () => {
    const px = aPixeles(118, lienzo, mesa);
    const f = aFraccion(px, lienzo, mesa);
    expect(esFraccion(f)).toBe(true);
    expect(aPixeles(f, lienzo, mesa)).toBeCloseTo(118, 0);
  });
});

describe('posicionLibre', () => {
  it('con el salón vacío arranca arriba a la izquierda', () => {
    expect(posicionLibre([])).toEqual({ x: 0, y: 0 });
  });

  it('no pisa una mesa existente', () => {
    const p = posicionLibre([{ x: 0, y: 0 }]);
    expect(p).not.toEqual({ x: 0, y: 0 });
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.2);
  });

  it('si no hay lugar libre cae al centro', () => {
    const todas = [0, 1 / 3, 2 / 3, 1].flatMap((y) => [0, 0.5, 1].map((x) => ({ x, y })));
    expect(posicionLibre(todas)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('numeración de mesas', () => {
  it('siguienteNumeroMesa usa el máximo + 1 e ignora números inválidos', () => {
    expect(siguienteNumeroMesa([])).toBe(1);
    expect(siguienteNumeroMesa([{ numero: 3 }, { numero: 7 }, { numero: 2 }])).toBe(8);
    expect(siguienteNumeroMesa([{ numero: Number.NaN }, { numero: 4 }])).toBe(5);
  });

  it('numeroMesaTexto rellena con cero', () => {
    expect(numeroMesaTexto(4)).toBe('04');
    expect(numeroMesaTexto(12)).toBe('12');
    expect(numeroMesaTexto(120)).toBe('120');
  });
});

describe('duelosPorMesa', () => {
  it('sin torneo o con el torneo finalizado no hay duelos', () => {
    expect(duelosPorMesa(null).size).toBe(0);
    const r: Ronda = { numero: 1, partidas: [partida({ mesaSalonId: 'm1' })] };
    expect(duelosPorMesa(torneo([r], 1, 'finalizado')).size).toBe(0);
  });

  it('marca solo las partidas sin resultado de la ronda actual con mesa asignada', () => {
    const r1: Ronda = { numero: 1, partidas: [partida({ mesaSalonId: 'vieja' })] };
    const r2: Ronda = {
      numero: 2,
      partidas: [
        partida({ mesa: 1, mesaSalonId: 'm1' }),
        partida({ mesa: 2, mesaSalonId: 'm2', resultado: '2-1' }),
        partida({ mesa: 3, mesaSalonId: null }),
        partida({ mesa: 4 }),
      ],
    };
    const duelos = duelosPorMesa(torneo([r1, r2], 2));
    expect([...duelos.keys()]).toEqual(['m1']);
    expect(duelos.get('m1')?.ronda).toBe(2);
    expect(duelos.get('m1')?.partida.mesa).toBe(1);
  });

  it('tolera documentos incompletos', () => {
    const roto = { estado: 'en_curso', rondaActual: 1, rondas: undefined } as unknown as TorneoDuelos;
    expect(duelosPorMesa(roto).size).toBe(0);
    const sinPartidas = { estado: 'en_curso', rondaActual: 1, rondas: [{ numero: 1 }] } as unknown as TorneoDuelos;
    expect(duelosPorMesa(sinPartidas).size).toBe(0);
    expect(duelosPorMesa(torneo([], 3)).size).toBe(0);
  });
});

describe('etiquetaDuelo', () => {
  it('muestra ronda y reloj', () => {
    expect(etiquetaDuelo(3, '12:40')).toBe('R3 · 12:40');
    expect(etiquetaDuelo(1, '12:40 · pausa')).toBe('R1 · 12:40 · pausa');
  });

  it('al llegar a cero avisa que terminó el tiempo', () => {
    expect(etiquetaDuelo(3, 'tiempo cumplido')).toBe('R3 · tiempo cumplido');
  });
});

describe('contarSalon', () => {
  it('cuenta ocupadas (consumo o duelo) y en duelo por separado', () => {
    const mesas = [
      { id: 'a', estado: 'libre' },
      { id: 'b', estado: 'consumo' },
      { id: 'c', estado: 'libre' },
      { id: 'd', estado: 'consumo' },
      { id: 'e', estado: 'ocupada' },
    ];
    const duelos = new Map([
      ['c', { ronda: 1, partida: partida({}) }],
      ['d', { ronda: 1, partida: partida({}) }],
    ]);
    expect(contarSalon(mesas, duelos)).toEqual({ ocupadas: 4, enDuelo: 2 });
  });
});

describe('normalizarLineas', () => {
  it('descarta renglones corruptos y completa los campos faltantes', () => {
    const raw = [
      { itemId: 'a', nombre: 'Espresso', precio: 2200, cantidad: 2, rubro: 'Café', origen: 'productos' },
      { itemId: 'b', cantidad: 1 },
      { nombre: 'sin id', cantidad: 1 },
      { itemId: 'c', cantidad: 0 },
      { itemId: 'd', cantidad: 0.4 },
      { itemId: 'e', cantidad: 'dos' },
      { itemId: 'f', cantidad: 1.6, rubro: 'Bebidas', origen: 'otro', precio: Number.NaN },
      null,
      'texto',
    ];
    const lineas = normalizarLineas(raw);
    expect(lineas.map((l) => l.itemId)).toEqual(['a', 'b', 'f']);
    expect(lineas[1]).toEqual({ itemId: 'b', nombre: 'Sin nombre', precio: 0, cantidad: 1, rubro: 'Café', origen: 'productos' });
    expect(lineas[2].cantidad).toBe(2);
    expect(lineas[2].precio).toBe(0);
  });

  it('si no es una lista devuelve la cuenta vacía', () => {
    expect(normalizarLineas(undefined)).toEqual([]);
    expect(normalizarLineas({ itemId: 'a' })).toEqual([]);
  });

  it('lee las cuentas abiertas con la versión anterior (productoId en vez de itemId)', () => {
    const lineas = normalizarLineas([{ productoId: 'p9', nombre: 'Medialuna', precio: 1400, emoji: 'x', cantidad: 3 }]);
    expect(lineas).toEqual([{ itemId: 'p9', nombre: 'Medialuna', precio: 1400, cantidad: 3, rubro: 'Café', origen: 'productos' }]);
  });
});

describe('lineasAgregadas', () => {
  it('devuelve solo lo que la cuenta local suma sobre la base', () => {
    const base = [linea({ itemId: 'a', cantidad: 2 }), linea({ itemId: 'b', cantidad: 1 })];
    const local = [linea({ itemId: 'a', cantidad: 3 }), linea({ itemId: 'b', cantidad: 1 }), linea({ itemId: 'c', cantidad: 2 })];
    expect(lineasAgregadas(local, base).map((l) => [l.itemId, l.cantidad])).toEqual([['a', 1], ['c', 2]]);
  });

  it('si la local tiene menos que la base no rescata nada', () => {
    expect(lineasAgregadas([linea({ itemId: 'a', cantidad: 1 })], [linea({ itemId: 'a', cantidad: 2 })])).toEqual([]);
  });
});

describe('mismoPedido', () => {
  const a = linea({ itemId: 'a', cantidad: 2 });
  const b = linea({ itemId: 'b', precio: 500 });

  it('no importa el orden', () => {
    expect(mismoPedido([a, b], [b, a])).toBe(true);
  });

  it('detecta cambios de cantidad, precio o renglones', () => {
    expect(mismoPedido([a, b], [{ ...a, cantidad: 3 }, b])).toBe(false);
    expect(mismoPedido([a, b], [a, { ...b, precio: 600 }])).toBe(false);
    expect(mismoPedido([a, b], [a])).toBe(false);
    expect(mismoPedido([], [])).toBe(true);
  });

  it('distingue un producto de cafetería de uno TCG con el mismo id', () => {
    expect(mismoPedido([a], [{ ...a, origen: 'tcg' }])).toBe(false);
  });
});

describe('armar la cuenta', () => {
  const espresso = producto({ id: 'esp', nombre: 'Espresso', precio: 2200, stock: 2 });
  const agua = producto({ id: 'agua', rubro: 'Mesa', stock: null });

  it('agregarItem suma una línea nueva o incrementa la existente', () => {
    const una = agregarItem([], espresso);
    expect(una).toEqual([{ itemId: 'esp', nombre: 'Espresso', precio: 2200, cantidad: 1, rubro: 'Café', origen: 'productos' }]);
    const dos = agregarItem(una, espresso);
    expect(dos).toHaveLength(1);
    expect(dos[0].cantidad).toBe(2);
    expect(una[0].cantidad).toBe(1);
  });

  it('cambiarCantidad saca la línea al llegar a cero', () => {
    const cuenta = agregarItem(agregarItem([], espresso), agua);
    expect(cambiarCantidad(cuenta, { itemId: 'esp', origen: 'productos' }, 1)[0].cantidad).toBe(2);
    expect(cambiarCantidad(cuenta, { itemId: 'esp', origen: 'productos' }, -1).map((l) => l.itemId)).toEqual(['agua']);
  });

  it('cantidadEnCuenta y puedeAgregar respetan el stock', () => {
    let cuenta = agregarItem([], espresso);
    expect(cantidadEnCuenta(cuenta, espresso)).toBe(1);
    expect(puedeAgregar(espresso, 1)).toBe(true);
    cuenta = agregarItem(cuenta, espresso);
    expect(puedeAgregar(espresso, cantidadEnCuenta(cuenta, espresso))).toBe(false);
    expect(puedeAgregar(agua, 500)).toBe(true);
    expect(puedeAgregar(producto({ id: 'x', stock: -3 }), 0)).toBe(false);
  });
});

describe('descuentosDeStock', () => {
  it('agrupa por producto, ignora los que no controlan stock y separa los que ya no existen', () => {
    const catalogo = [
      producto({ id: 'esp', stock: 10 }),
      producto({ id: 'agua', rubro: 'Mesa', stock: null }),
      producto({ id: 'sobre', rubro: 'TCG', origen: 'tcg', stock: 30 }),
    ];
    const cuenta = [
      linea({ itemId: 'esp', cantidad: 2 }),
      linea({ itemId: 'esp', cantidad: 1 }),
      linea({ itemId: 'agua', cantidad: 3 }),
      linea({ itemId: 'sobre', origen: 'tcg', rubro: 'TCG', cantidad: 4 }),
      linea({ itemId: 'borrado', cantidad: 1 }),
      linea({ itemId: 'sobre', origen: 'productos', cantidad: 1 }),
    ];
    const { descuentos, huerfanas } = descuentosDeStock(cuenta, catalogo);
    expect(descuentos).toEqual([
      { coleccion: 'productos', id: 'esp', cantidad: 3 },
      { coleccion: 'tcg_productos', id: 'sobre', cantidad: 4 },
    ]);
    expect(huerfanas.map((h) => `${h.origen}:${h.itemId}`)).toEqual(['productos:borrado', 'productos:sobre']);
  });
});

describe('crédito de torneo al cobrar', () => {
  it('nunca aplica más que la cuenta ni que el saldo', () => {
    expect(creditoAplicable(4000, 18100)).toBe(4000);
    expect(creditoAplicable(25000, 18100)).toBe(18100);
    expect(creditoAplicable(0, 18100)).toBe(0);
    expect(creditoAplicable(-500, 18100)).toBe(0);
    expect(creditoAplicable(1500.9, 18100)).toBe(1500);
    expect(creditoAplicable(Number.NaN, 100)).toBe(0);
    expect(creditoAplicable(9000, 6601.5)).toBeLessThanOrEqual(6601.5);
  });

  it('si el crédito cubre todo el medio es crédito de torneo', () => {
    expect(medioDePagoFinal(0, null, 2200)).toBe('credito_torneo');
    expect(medioDePagoFinal(0, 'efectivo', 2200)).toBe('credito_torneo');
  });

  it('una cuenta de $0 sin crédito no se registra como crédito de torneo', () => {
    expect(medioDePagoFinal(0, null, 0)).toBe('efectivo');
  });

  it('si queda saldo exige un medio real', () => {
    expect(medioDePagoFinal(1200, null)).toBeNull();
    expect(medioDePagoFinal(1200, 'qr')).toBe('qr');
    expect(medioDePagoFinal(1200, 'credito_torneo')).toBeNull();
  });
});

describe('coincideBusqueda', () => {
  it('ignora mayúsculas y tildes', () => {
    expect(coincideBusqueda('Sofía Martínez', 'sofia')).toBe(true);
    expect(coincideBusqueda('Sofía Martínez', 'MARTI')).toBe(true);
    expect(coincideBusqueda('Nahuel', 'sofi')).toBe(false);
  });

  it('una búsqueda vacía coincide con todo', () => {
    expect(coincideBusqueda('Nahuel', '   ')).toBe(true);
  });
});

describe('esperarConfirmacion', () => {
  it('devuelve confirmado si la escritura termina a tiempo', async () => {
    await expect(esperarConfirmacion(Promise.resolve(), 50, jest.fn())).resolves.toBe('confirmado');
  });

  it('propaga el error si falla antes del tope', async () => {
    const error = { code: 'permission-denied' };
    await expect(esperarConfirmacion(Promise.reject(error), 50, jest.fn())).rejects.toBe(error);
  });

  it('sin respuesta a tiempo queda pendiente y avisa si después falla', async () => {
    let rechazar: (e: unknown) => void = () => undefined;
    const escritura = new Promise((_, reject) => {
      rechazar = reject;
    });
    const tardio = jest.fn();
    await expect(esperarConfirmacion(escritura, 10, tardio)).resolves.toBe('pendiente');
    rechazar({ code: 'permission-denied' });
    await new Promise((r) => setTimeout(r, 0));
    expect(tardio).toHaveBeenCalledWith({ code: 'permission-denied' });
  });
});

function textoDe(r: RenderPrueba): string {
  return JSON.stringify(r.toJSON());
}

function control(r: RenderPrueba, etiqueta: string | RegExp): NodoPrueba {
  const coincide = (v: unknown) => typeof v === 'string' && (typeof etiqueta === 'string' ? v === etiqueta : etiqueta.test(v));
  const nodo = r.root.findAll((n) => coincide(n.props.accessibilityLabel) && typeof n.props.onPress === 'function')[0];
  if (!nodo) throw new Error(`No hay un control "${String(etiqueta)}"`);
  return nodo;
}

function deshabilitado(nodo: NodoPrueba): boolean {
  const estado = nodo.props.accessibilityState as { disabled?: boolean } | undefined;
  return nodo.props.disabled === true || estado?.disabled === true;
}

async function tocarControl(r: RenderPrueba, etiqueta: string | RegExp): Promise<void> {
  const nodo = control(r, etiqueta);
  await act(async () => {
    (nodo.props.onPress as () => void)();
  });
}

const montados = new Set<RenderPrueba>();

async function montar(el: React.ReactElement): Promise<RenderPrueba> {
  let r: RenderPrueba | null = null;
  await act(async () => {
    r = renderer.create(el);
  });
  if (!r) throw new Error('No se montó');
  montados.add(r);
  return r;
}

async function desmontar(r: RenderPrueba): Promise<void> {
  if (!montados.delete(r)) return;
  await act(async () => {
    r.unmount();
  });
}

// Una aserción que falla antes de desmontar dejaría timers vivos (reloj de caja, timer del duelo) y Jest no terminaría.
afterEach(async () => {
  for (const r of [...montados]) await desmontar(r);
});

async function emitirDoc(path: string, datos: Record<string, unknown>): Promise<void> {
  mockDocs[path] = datos;
  const escucha = mockEscuchas.get(path);
  if (!escucha) throw new Error(`Nadie escucha ${path}`);
  await act(async () => {
    escucha(mockSnapDoc(path));
  });
}

function lineaEspresso(cantidad: number): ItemPedido {
  return { itemId: 'esp', nombre: 'Espresso', precio: 2200, cantidad, rubro: 'Café', origen: 'productos' };
}

function torneoConDuelo(): Torneo {
  return {
    id: 't1',
    nombre: 'Copa de septiembre',
    juego: 'Pokémon TCG',
    formatoId: 'suizo',
    formato: 'Suizo',
    totalRondas: 5,
    topCut: 0,
    minutosPorRonda: 50,
    minutosExtra: 3,
    inscripcion: 6000,
    cupo: 16,
    jugadores: [],
    jugadoresUids: ['j1', 'j2'],
    estado: 'en_curso',
    rondaActual: 3,
    rondas: [
      {
        numero: 3,
        partidas: [
          {
            mesa: 1,
            jugador1: { uid: 'j1', nombre: 'Nahuel', pagado: true },
            jugador2: { uid: 'j2', nombre: 'Sofía', pagado: true },
            resultado: null,
            mesaSalonId: 'm1',
          },
        ],
      },
    ],
    premios: [],
    rondaFinEn: null,
    rondaRestanteMs: 760_000,
    rondaPausada: true,
    fecha: '2026-09-24',
  };
}

function reiniciarDatos(): void {
  jest.clearAllMocks();
  for (const k of Object.keys(mockColecciones)) delete mockColecciones[k];
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
  mockEscuchas.clear();
  mockBatches.length = 0;
  mockFallaTransaccion = null;
  mockPrevenir.activo = false;
  mockPrevenir.alSalir = null;
  mockAuto = 0;
  mockParams = { mesaId: 'm1' };
  mockConfig = CONFIG_DEFAULT;
  mockPerfil = { uid: 'yo', nombre: 'Lu', email: 'lu@duel.com', role: 'mozo', estadoAprobacion: 'aprobado' };
  mockTorneo = null;
  mockColecciones.productos = [
    { id: 'esp', nombre: 'Espresso', precio: 2200, rubro: 'Café', controlStock: true, stock: 40 },
    { id: 'med', nombre: 'Medialuna', precio: 1400, rubro: 'Pastelería', controlStock: true, stock: 1 },
    { id: 'agua', nombre: 'Agua', precio: 1200, rubro: 'Mesa', controlStock: false },
    { id: 'viejo', nombre: 'Tostado', precio: 3000, rubro: 'Café', controlStock: false, activo: false },
  ];
  mockColecciones.tcg_productos = [{ id: 'sobre', nombre: 'Sobre Surging Sparks', valor: 7500, stock: 0 }];
  const j1 = { nombre: 'Nahuel', nombreBusqueda: 'nahuel', creditoCafeteria: 4000 };
  const j2 = { nombre: 'Sofía', nombreBusqueda: 'sofia', creditoCafeteria: 0 };
  mockColecciones.jugadores = [
    { id: 'j1', ...j1 },
    { id: 'j2', ...j2 },
  ];
  mockDocs['jugadores/j1'] = j1;
  mockDocs['jugadores/j2'] = j2;
  mockDocs['mesas/m1'] = { numero: 4, tipo: 'cafe', estado: 'consumo', salaId: 's1', pedido: [lineaEspresso(1)] };
}

describe('pantalla Pedido', () => {
  beforeEach(reiniciarDatos);

  it('muestra la mesa, el catálogo activo por rubro y deshabilita lo que no tiene stock', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Mesa 04');
    expect(texto).toContain('Consumo');
    expect(texto).toContain('Espresso');
    expect(texto).not.toContain('Tostado');
    // "quedan" descuenta lo que ya está en la cuenta y la tarjeta muestra cuántos van.
    expect(control(r, 'Espresso, $2.200 · quedan 39, 1 en la cuenta')).toBeTruthy();
    await tocarControl(r, 'TCG');
    expect(deshabilitado(control(r, /^Sobre Surging Sparks, \$7\.500 · sin stock/))).toBe(true);
    await desmontar(r);
  });

  it('suma productos, respeta el stock y guarda el pedido de la mesa', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    expect(deshabilitado(control(r, 'Guardar'))).toBe(true);
    await tocarControl(r, /^Espresso, /);
    expect(textoDe(r)).toContain('Cobrar $4.400');
    await tocarControl(r, 'Pastelería');
    await tocarControl(r, /^Medialuna, /);
    await tocarControl(r, /^Medialuna, /);
    expect(mockMostrar).toHaveBeenCalledWith('No hay más Medialuna en stock', 'info');
    expect(control(r, 'Medialuna, $1.400 · no queda más, 1 en la cuenta')).toBeTruthy();
    expect(mockPrevenir.activo).toBe(true);
    await tocarControl(r, 'Guardar');
    expect(mockBatches).toEqual([
      [
        {
          op: 'update',
          path: 'mesas/m1',
          datos: {
            pedido: [lineaEspresso(2), { itemId: 'med', nombre: 'Medialuna', precio: 1400, cantidad: 1, rubro: 'Pastelería', origen: 'productos' }],
            estado: 'consumo',
          },
        },
      ],
    ]);
    expect(mockMostrar).toHaveBeenCalledWith('Mesa 04 guardada', 'ok');
    expect(mockPrevenir.activo).toBe(false);
    expect(mockBack).toHaveBeenCalled();
    await desmontar(r);
  });

  it('cobra en una sola transacción: venta, stock, mesa libre', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $2.200');
    expect(deshabilitado(control(r, 'Confirmar cobro $2.200'))).toBe(true);
    await tocarControl(r, 'Efectivo');
    await tocarControl(r, 'Confirmar cobro $2.200');
    expect(mockBatches).toHaveLength(1);
    const [venta, ...resto] = mockBatches[0];
    expect(venta.op).toBe('set');
    expect(venta.path).toMatch(/^ventas\//);
    expect(venta.datos).toEqual({
      mesaId: 'm1',
      mesaNum: 4,
      items: [lineaEspresso(1)],
      subtotal: 2200,
      creditoAplicado: 0,
      creditoUid: null,
      total: 2200,
      medioPago: 'efectivo',
      fecha: fechaLocal(),
      hora: expect.stringMatching(/^\d{2}:\d{2}$/),
      creadoPor: 'yo',
      creadoEn: 'TS',
    });
    expect(resto).toEqual([
      { op: 'update', path: 'productos/esp', datos: { stock: { incremento: -1 } } },
      { op: 'update', path: 'mesas/m1', datos: { pedido: [], estado: 'libre' } },
    ]);
    expect(mockMostrar).toHaveBeenCalledWith('Cobrado $2.200', 'ok');
    expect(mockBack).toHaveBeenCalled();
    await desmontar(r);
  });

  it('no descuenta stock si el local lo tiene apagado', async () => {
    mockConfig = { ...CONFIG_DEFAULT, descontarStock: false };
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $2.200');
    await tocarControl(r, 'QR');
    await tocarControl(r, 'Confirmar cobro $2.200');
    expect(mockBatches[0].map((o) => o.path.split('/')[0])).toEqual(['ventas', 'mesas']);
    await desmontar(r);
  });

  it('en una mesa de duelo ofrece el crédito de los jugadores sentados y lo descuenta', async () => {
    mockTorneo = torneoConDuelo();
    const r = await montar(React.createElement(PedidoScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Duelo · R3 · 12:40');
    expect(texto).toContain('Nahuel tiene $4.000');
    await tocarControl(r, 'Cobrar $2.200');
    expect(deshabilitado(control(r, 'Sofía, sin crédito'))).toBe(true);
    await tocarControl(r, 'Nahuel, $4.000 de crédito');
    expect(textoDe(r)).toContain('Aplicar $2.200');
    await tocarControl(r, 'Confirmar cobro $0');
    const ops = mockBatches[0];
    expect(ops[0].datos).toMatchObject({ subtotal: 2200, creditoAplicado: 2200, creditoUid: 'j1', total: 0, medioPago: 'credito_torneo' });
    const ventaId = ops[0].path.split('/')[1];
    expect(ops).toContainEqual({ op: 'update', path: 'jugadores/j1', datos: { creditoCafeteria: { incremento: -2200 }, ultimaVenta: ventaId } });
    expect(mockMostrar).toHaveBeenCalledWith('Cobrado con crédito de torneo', 'ok');
    await desmontar(r);
  });

  it('crédito parcial: exige medio de pago por el resto', async () => {
    mockDocs['mesas/m1'] = { numero: 4, tipo: 'cafe', estado: 'consumo', salaId: 's1', pedido: [lineaEspresso(3)] };
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $6.600');
    await tocarControl(r, 'Nahuel, $4.000 de crédito');
    expect(deshabilitado(control(r, 'Confirmar cobro $2.600'))).toBe(true);
    await tocarControl(r, 'Débito');
    await tocarControl(r, 'Confirmar cobro $2.600');
    expect(mockBatches[0][0].datos).toMatchObject({ subtotal: 6600, creditoAplicado: 4000, total: 2600, medioPago: 'debito' });
    await desmontar(r);
  });

  it('avisa si otro dispositivo cambió la mesa y no la pisa en silencio', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, /^Espresso, /);
    const deOtro = { itemId: 'med', nombre: 'Medialuna', precio: 1400, cantidad: 1, rubro: 'Pastelería', origen: 'productos' };
    await emitirDoc('mesas/m1', { numero: 4, tipo: 'cafe', estado: 'consumo', salaId: 's1', pedido: [deOtro] });
    expect(textoDe(r)).toContain('Otro dispositivo actualizó esta mesa');
    expect(deshabilitado(control(r, 'Guardar'))).toBe(true);
    expect(deshabilitado(control(r, 'Cobrar $4.400'))).toBe(true);
    await tocarControl(r, 'Recargar la cuenta del otro dispositivo');
    const texto = textoDe(r);
    expect(texto).not.toContain('Otro dispositivo actualizó esta mesa');
    expect(texto).toContain('Cobrar $1.400');
    expect(mockBatches).toHaveLength(0);
    await desmontar(r);
  });

  it('si otro dispositivo cobró la mesa, ofrece abrir una cuenta nueva solo con lo agregado', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, /^Espresso, /);
    await emitirDoc('mesas/m1', { numero: 4, tipo: 'cafe', estado: 'libre', salaId: 's1', pedido: [] });
    const texto = textoDe(r);
    expect(texto).toContain('Esta mesa se cobró (o se liberó) en otro dispositivo');
    expect(texto).not.toContain('Mantener la mía');
    await tocarControl(r, 'Abrir una cuenta nueva con lo que agregaste');
    // Solo el espresso que sumó este mozo: el que ya estaba se cobró en el otro dispositivo.
    expect(textoDe(r)).toContain('Cobrar $2.200');
    await tocarControl(r, 'Guardar');
    expect(mockBatches[0]).toEqual([{ op: 'update', path: 'mesas/m1', datos: { pedido: [lineaEspresso(1)], estado: 'consumo' } }]);
    await desmontar(r);
  });

  it('no cobra si la mesa cambió en el servidor mientras la hoja estaba abierta', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $2.200');
    await tocarControl(r, 'Efectivo');
    // Otro mozo ya la cobró y el aviso todavía no llegó a este teléfono.
    mockDocs['mesas/m1'] = { numero: 4, tipo: 'cafe', estado: 'libre', salaId: 's1', pedido: [] };
    await tocarControl(r, 'Confirmar cobro $2.200');
    expect(mockBatches).toHaveLength(0);
    expect(textoDe(r)).toContain('Otro dispositivo cambió esta mesa mientras cobrabas');
    expect(mockBack).not.toHaveBeenCalled();
    await desmontar(r);
  });

  it('sin conexión el cobro no se registra, lo dice y deja la hoja abierta', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $2.200');
    await tocarControl(r, 'Efectivo');
    mockFallaTransaccion = { code: 'unavailable' };
    await tocarControl(r, 'Confirmar cobro $2.200');
    expect(textoDe(r)).toContain('el cobro NO se registró');
    expect(mockMostrar).not.toHaveBeenCalledWith('Cobrado $2.200', 'ok');
    expect(control(r, 'Confirmar cobro $2.200')).toBeTruthy();
    await desmontar(r);
  });

  it('no descuenta más crédito del que el jugador tiene en el servidor', async () => {
    mockTorneo = torneoConDuelo();
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, 'Cobrar $2.200');
    await tocarControl(r, 'Nahuel, $4.000 de crédito');
    // Lo gastó en otra mesa hace un segundo.
    mockDocs['jugadores/j1'] = { nombre: 'Nahuel', nombreBusqueda: 'nahuel', creditoCafeteria: 1000 };
    await tocarControl(r, 'Confirmar cobro $0');
    expect(mockBatches).toHaveLength(0);
    expect(textoDe(r)).toContain('Nahuel ya no tiene ese crédito: le quedan $1.000.');
    await desmontar(r);
  });

  it('salir con cambios sin guardar pregunta y Descartar sigue la navegación', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await montar(React.createElement(PedidoScreen));
    expect(mockPrevenir.activo).toBe(false);
    await tocarControl(r, /^Espresso, /);
    expect(mockPrevenir.activo).toBe(true);
    const accion = { type: 'GO_BACK' };
    act(() => mockPrevenir.alSalir?.({ data: { action: accion } }));
    expect(alerta).toHaveBeenCalledTimes(1);
    const botones = alerta.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(botones.map((b) => b.text)).toEqual(['Seguir editando', 'Descartar', 'Guardar']);
    botones[1].onPress?.();
    expect(mockDispatch).toHaveBeenCalledWith(accion);
    alerta.mockRestore();
    await desmontar(r);
  });

  it('sin cambios locales adopta lo que llega de otro dispositivo', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await emitirDoc('mesas/m1', { numero: 4, tipo: 'cafe', estado: 'consumo', salaId: 's1', pedido: [lineaEspresso(5)] });
    const texto = textoDe(r);
    expect(texto).not.toContain('Otro dispositivo actualizó esta mesa');
    expect(texto).toContain('Cobrar $11.000');
    await desmontar(r);
  });

  it('una línea de un producto borrado se cobra pero no descuenta stock', async () => {
    const borrado = { itemId: 'borrado', nombre: 'Alfajor', precio: 1000, cantidad: 1, rubro: 'Pastelería', origen: 'productos' };
    mockDocs['mesas/m1'] = { numero: 4, tipo: 'cafe', estado: 'consumo', salaId: 's1', pedido: [lineaEspresso(1), borrado] };
    const r = await montar(React.createElement(PedidoScreen));
    expect(textoDe(r)).toContain('Ya no está en el catálogo');
    await tocarControl(r, 'Cobrar $3.200');
    await tocarControl(r, 'Efectivo');
    await tocarControl(r, 'Confirmar cobro $3.200');
    const paths = mockBatches[0].map((o) => o.path);
    expect(paths).toContain('productos/esp');
    expect(paths).not.toContain('productos/borrado');
    await desmontar(r);
  });

  it('una mesa vieja marcada ocupada con la cuenta vacía se puede liberar', async () => {
    mockDocs['mesas/m1'] = { numero: 4, tipo: 'cafe', estado: 'ocupada', salaId: 's1', pedido: [] };
    const r = await montar(React.createElement(PedidoScreen));
    expect(deshabilitado(control(r, 'Liberar mesa'))).toBe(false);
    await tocarControl(r, 'Liberar mesa');
    expect(mockBatches[0]).toEqual([{ op: 'update', path: 'mesas/m1', datos: { pedido: [], estado: 'libre' } }]);
    expect(mockMostrar).toHaveBeenCalledWith('Mesa 04 libre', 'ok');
    await desmontar(r);
  });

  it('salir mientras se guarda espera la confirmación y no pierde lo cargado si falla', async () => {
    const r = await montar(React.createElement(PedidoScreen));
    await tocarControl(r, /^Espresso, /);
    mockFallaTransaccion = { code: 'unavailable' };
    // Se toca Guardar y, antes de que responda, atrás.
    let guardado: Promise<void> = Promise.resolve();
    await act(async () => {
      guardado = Promise.resolve((control(r, 'Guardar').props.onPress as () => void)());
      mockPrevenir.alSalir?.({ data: { action: { type: 'GO_BACK' } } });
      await guardado;
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(textoDe(r)).toContain('Cobrar $4.400');
    expect(mockMostrar).toHaveBeenCalledWith('Sin conexión: la mesa NO se guardó. Tus cambios siguen en pantalla.', 'error');
    await desmontar(r);
  });

  it('una mesa que ya no existe muestra un estado vacío', async () => {
    mockDocs['mesas/m1'] = null;
    const r = await montar(React.createElement(PedidoScreen));
    expect(textoDe(r)).toContain('Esta mesa ya no existe');
    await desmontar(r);
  });

  it('el juez no toma pedidos', async () => {
    mockPerfil = { ...mockPerfil, role: 'juez' };
    const r = await montar(React.createElement(PedidoScreen));
    expect(textoDe(r)).toContain('Solo mozos y admin toman pedidos');
    await desmontar(r);
  });
});

describe('pantalla Salón', () => {
  beforeEach(() => {
    reiniciarDatos();
    mockColecciones.salas = [
      { id: 's2', nombre: 'Terraza', orden: 1 },
      { id: 's1', nombre: 'Planta baja', orden: 0 },
    ];
    mockColecciones.mesas = [
      { id: 'm1', numero: 4, tipo: 'duelo', estado: 'libre', salaId: 's1', x: 0, y: 0, pedido: [] },
      { id: 'm2', numero: 8, tipo: 'cafe', estado: 'consumo', salaId: 's1', x: 0.5, y: 1, pedido: [lineaEspresso(2)] },
      { id: 'm3', numero: 9, tipo: 'cafe', estado: 'libre', salaId: 's1', x: 118, y: 268, pedido: [] },
      { id: 'm4', numero: 12, tipo: 'cafe', estado: 'libre', salaId: 's2', x: 0.2, y: 0.2, pedido: [] },
    ];
    mockTorneo = torneoConDuelo();
  });

  async function montarSalon(): Promise<RenderPrueba> {
    const r = await montar(React.createElement(SalonScreen));
    const lienzo = r.root.findAll((n) => typeof n.props.onLayout === 'function')[0];
    await act(async () => {
      (lienzo.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 342, height: 402, x: 0, y: 0 } } });
    });
    return r;
  }

  it('pinta los estados de las mesas y el resumen del local', async () => {
    const r = await montarSalon();
    const texto = textoDe(r);
    expect(texto).toContain('2 ocupadas · 1 en duelo');
    expect(control(r, 'Mesa 04, duelo, duelo en curso, R3 · 12:40 · pausa')).toBeTruthy();
    expect(control(r, 'Mesa 08, café, cuenta abierta de $4.400')).toBeTruthy();
    expect(control(r, 'Mesa 09, café, libre')).toBeTruthy();
    expect(() => control(r, /^Mesa 12/)).toThrow();
    expect(texto).toContain('Duelo en curso');
    await desmontar(r);
  });

  it('las salas salen ordenadas y cambian el plano', async () => {
    const r = await montarSalon();
    const chips = r.root
      .findAll((n) => typeof n.props.onPress === 'function' && ['Planta baja', 'Terraza'].includes(String(n.props.accessibilityLabel)))
      .map((n) => n.props.accessibilityLabel);
    expect(chips.indexOf('Planta baja')).toBeLessThan(chips.indexOf('Terraza'));
    await tocarControl(r, 'Terraza');
    expect(control(r, 'Mesa 12, café, libre')).toBeTruthy();
    await desmontar(r);
  });

  it('tocar una mesa abre su pedido', async () => {
    const r = await montarSalon();
    await tocarControl(r, 'Mesa 08, café, cuenta abierta de $4.400');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/salon/pedido', params: { mesaId: 'm2' } });
    await desmontar(r);
  });

  it('el mozo no ve las herramientas de admin', async () => {
    const r = await montarSalon();
    expect(() => control(r, '+ Mesa')).toThrow();
    expect(() => control(r, '+ Sala')).toThrow();
    await desmontar(r);
  });

  it('el admin puede agregar mesas y salas', async () => {
    mockPerfil = { ...mockPerfil, role: 'admin' };
    const r = await montarSalon();
    expect(control(r, '+ Mesa')).toBeTruthy();
    expect(control(r, '+ Sala')).toBeTruthy();
    await desmontar(r);
  });

  it('sin salas explica qué hacer', async () => {
    mockColecciones.salas = [];
    const r = await montar(React.createElement(SalonScreen));
    expect(textoDe(r)).toContain('Todavía no hay salas');
    await desmontar(r);
  });
});
