import React, { act } from 'react';
import { CONFIG_DEFAULT, ConfigLocal } from '../lib/config';
import { fechaLocal, sumarDias } from '../lib/fecha';
import { formatARS, formatCantidad, stockBajo, subtotalDe } from '../lib/pedido';
import type { CatalogoItem, ItemPedido } from '../lib/pedido';
import { admiteDecimales, parsearCantidad, parsearMonto, validarIngreso, validarProducto } from '../lib/stock';
import type { FormIngreso } from '../lib/stock';
import { normalizarVenta, resumirCaja } from '../hooks/useCaja';
import type { VentaCaja } from '../hooks/useCaja';
import StockScreen from '../app/(tabs)/stock';
import CajaScreen from '../app/(tabs)/caja';

// Pruebas de QA: formato y reglas del pedido, validaciones del depósito, cierre de caja y las pantallas Stock y Caja con Firebase simulado.

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

type RefFalsa = { tipo: 'doc'; path: string } | { tipo: 'col'; nombre: string } | { tipo: 'query'; nombre: string; filtros: unknown[] };
type DocFalso = { id: string } & Record<string, unknown>;
interface OpBatch {
  op: 'set' | 'update' | 'delete';
  path: string;
  datos?: Record<string, unknown>;
}

const mockColecciones: Record<string, DocFalso[]> = {};
const mockBatches: OpBatch[][] = [];
const mockUpdateDoc = jest.fn((_path: string, _datos: Record<string, unknown>) => Promise.resolve());
const mockAddDoc = jest.fn((_coleccion: string, _datos: Record<string, unknown>) => Promise.resolve({ id: 'nuevo' }));
const mockDeleteDoc = jest.fn((_path: string) => Promise.resolve());
const mockMostrar = jest.fn();
const mockRedirect = jest.fn();
let mockAuto = 0;
let mockConfig: ConfigLocal = CONFIG_DEFAULT;
let mockPerfil = { uid: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' };

function mockSnapCol(nombre: string) {
  const lista = mockColecciones[nombre] ?? [];
  return { docs: lista.map(({ id, ...datos }) => ({ id, data: () => datos })) };
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
  onSnapshot: (ref: RefFalsa, next: (snap: unknown) => void) => {
    next(mockSnapCol(ref.tipo === 'doc' ? ref.path : ref.nombre));
    return () => undefined;
  },
  updateDoc: (ref: { path: string }, datos: Record<string, unknown>) => mockUpdateDoc(ref.path, datos),
  addDoc: (col: { nombre: string }, datos: Record<string, unknown>) => mockAddDoc(col.nombre, datos),
  deleteDoc: (ref: { path: string }) => mockDeleteDoc(ref.path),
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
  increment: (n: number) => ({ incremento: n }),
  serverTimestamp: () => 'TS',
  deleteField: () => 'BORRAR',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn() }),
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
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

describe('formatARS', () => {
  it('separa miles con punto y antepone $', () => {
    expect(formatARS(0)).toBe('$0');
    expect(formatARS(999)).toBe('$999');
    expect(formatARS(12400)).toBe('$12.400');
    expect(formatARS(184300)).toBe('$184.300');
    expect(formatARS(1234567)).toBe('$1.234.567');
  });

  it('muestra negativos con el signo antes del $', () => {
    expect(formatARS(-1500)).toBe('-$1.500');
    expect(formatARS(-12)).toBe('-$12');
  });

  it('redondea los decimales (ARS sin centavos)', () => {
    expect(formatARS(12.4)).toBe('$12');
    expect(formatARS(999.6)).toBe('$1.000');
    expect(formatARS(1499.5)).toBe('$1.500');
  });

  it('un valor no numérico se muestra como $0', () => {
    expect(formatARS(Number.NaN)).toBe('$0');
    expect(formatARS(Number.POSITIVE_INFINITY)).toBe('$0');
  });
});

describe('subtotalDe', () => {
  it('suma precio × cantidad de cada línea', () => {
    const items: ItemPedido[] = [
      { itemId: 'a', nombre: 'Flat white', precio: 3200, cantidad: 2, rubro: 'Café', origen: 'productos' },
      { itemId: 'b', nombre: 'Medialuna', precio: 1400, cantidad: 3, rubro: 'Pastelería', origen: 'productos' },
      { itemId: 'c', nombre: 'Sobre', precio: 7500, cantidad: 1, rubro: 'TCG', origen: 'tcg' },
    ];
    expect(subtotalDe(items)).toBe(18100);
  });

  it('una cuenta vacía da cero', () => {
    expect(subtotalDe([])).toBe(0);
  });
});

describe('stockBajo', () => {
  it('usa la alerta del local cuando el producto no tiene una propia', () => {
    expect(stockBajo({ stock: 5, alerta: null }, 5)).toBe(true);
    expect(stockBajo({ stock: 6, alerta: null }, 5)).toBe(false);
  });

  it('la alerta propia del producto manda sobre la del local', () => {
    expect(stockBajo({ stock: 8, alerta: 10 }, 5)).toBe(true);
    expect(stockBajo({ stock: 3, alerta: 2 }, 5)).toBe(false);
    expect(stockBajo({ stock: 0, alerta: 0 }, 5)).toBe(true);
  });

  it('el stock negativo (sobreventa) siempre es bajo', () => {
    expect(stockBajo({ stock: -2, alerta: null }, 0)).toBe(true);
  });

  it('un producto sin control de stock nunca está bajo', () => {
    expect(stockBajo({ stock: null, alerta: 10 }, 5)).toBe(false);
  });
});

describe('formatCantidad', () => {
  it('enteros sin decimales', () => {
    expect(formatCantidad(18, 'L')).toBe('18 L');
    expect(formatCantidad(12, 'u')).toBe('12 u');
    expect(formatCantidad(0, 'pack')).toBe('0 pack');
  });

  it('decimales con coma y un dígito', () => {
    expect(formatCantidad(4.2, 'kg')).toBe('4,2 kg');
    expect(formatCantidad(0.26, 'kg')).toBe('0,3 kg');
  });

  it('negativos (sobreventa)', () => {
    expect(formatCantidad(-2, 'u')).toBe('-2 u');
  });
});

describe('parseo de números del depósito', () => {
  it('solo kg y L admiten decimales', () => {
    expect(admiteDecimales('kg')).toBe(true);
    expect(admiteDecimales('L')).toBe(true);
    expect(admiteDecimales('u')).toBe(false);
    expect(admiteDecimales('pack')).toBe(false);
  });

  it('parsearCantidad acepta coma o punto decimal según la unidad', () => {
    expect(parsearCantidad('4,5', 'kg')).toBe(4.5);
    expect(parsearCantidad('4.25', 'L')).toBe(4.25);
    expect(parsearCantidad(' 12 ', 'u')).toBe(12);
    expect(parsearCantidad('4,5', 'u')).toBeNull();
    expect(parsearCantidad('1,2345', 'kg')).toBeNull();
    expect(parsearCantidad('-3', 'u')).toBeNull();
    expect(parsearCantidad('', 'u')).toBeNull();
    expect(parsearCantidad('diez', 'u')).toBeNull();
  });

  it('parsearMonto toma el punto como separador de miles', () => {
    expect(parsearMonto('1.500')).toBe(1500);
    expect(parsearMonto('$ 12.400')).toBe(12400);
    expect(parsearMonto('3200')).toBe(3200);
    expect(parsearMonto('0')).toBe(0);
    expect(parsearMonto('1.234.567')).toBe(1234567);
    expect(parsearMonto('12,50')).toBeNull();
    expect(parsearMonto('2200.50')).toBeNull();
    expect(parsearMonto('1.5')).toBeNull();
    expect(parsearMonto('-100')).toBeNull();
    expect(parsearMonto('')).toBeNull();
  });
});

describe('validarIngreso', () => {
  const base: FormIngreso = { modo: 'nuevo', producto: null, nombre: '', rubro: 'Café', unidad: 'u', precio: '', cantidad: '', costo: '' };
  const catalogo = [producto({ id: 'med', nombre: 'Medialunas', rubro: 'Pastelería' }), producto({ id: 'agua', nombre: 'Agua', rubro: 'Mesa', stock: null })];

  it('producto nuevo: exige nombre, precio de venta, cantidad y costo', () => {
    expect(validarIngreso(base, catalogo).ok).toBe(false);
    expect(validarIngreso({ ...base, nombre: 'Cookies' }, catalogo)).toEqual({ ok: false, error: expect.stringContaining('precio') });
    expect(validarIngreso({ ...base, nombre: 'Cookies', precio: '1900' }, catalogo)).toEqual({ ok: false, error: expect.stringContaining('cantidad') });
    expect(validarIngreso({ ...base, nombre: 'Cookies', precio: '1900', cantidad: '12' }, catalogo)).toEqual({ ok: false, error: expect.stringContaining('costo') });
    const ok = validarIngreso({ ...base, nombre: '  Cookies   de avena ', precio: '1.900', cantidad: '12', costo: '800' }, catalogo);
    expect(ok).toEqual({
      ok: true,
      valor: { tipo: 'nuevo', nombre: 'Cookies de avena', rubro: 'Café', unidad: 'u', precio: 1900, cantidad: 12, costoUnitario: 800 },
    });
  });

  it('producto nuevo: no deja duplicar un nombre del mismo rubro', () => {
    const r = validarIngreso({ ...base, nombre: 'medialunas', rubro: 'Pastelería', precio: '1400', cantidad: '10', costo: '500' }, catalogo);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Ya existe') });
  });

  it('decimales solo en kg y L', () => {
    expect(validarIngreso({ ...base, nombre: 'Café en grano', precio: '30000', unidad: 'kg', cantidad: '4,2', costo: '18000' }, catalogo).ok).toBe(true);
    expect(validarIngreso({ ...base, nombre: 'Deckbox', rubro: 'TCG', precio: '9800', unidad: 'u', cantidad: '1,5', costo: '5000' }, catalogo).ok).toBe(false);
  });

  it('producto existente: usa su unidad y exige que controle stock', () => {
    const cafe = producto({ id: 'cafe', nombre: 'Café en grano', unidad: 'kg', stock: 1 });
    const r = validarIngreso({ ...base, modo: 'existente', producto: cafe, cantidad: '2,5', costo: '0' }, catalogo);
    expect(r).toEqual({ ok: true, valor: { tipo: 'existente', producto: cafe, cantidad: 2.5, costoUnitario: 0 } });
    expect(validarIngreso({ ...base, modo: 'existente', producto: null, cantidad: '1', costo: '1' }, catalogo).ok).toBe(false);
    const sinControl = producto({ id: 'x', stock: null });
    expect(validarIngreso({ ...base, modo: 'existente', producto: sinControl, cantidad: '1', costo: '1' }, catalogo).ok).toBe(false);
  });

  it('rechaza cantidades en cero o absurdas', () => {
    const cafe = producto({ id: 'cafe', unidad: 'u' });
    expect(validarIngreso({ ...base, modo: 'existente', producto: cafe, cantidad: '0', costo: '1' }, catalogo).ok).toBe(false);
    expect(validarIngreso({ ...base, modo: 'existente', producto: cafe, cantidad: '1000000', costo: '1' }, catalogo).ok).toBe(false);
  });
});

describe('validarProducto', () => {
  const catalogo = [producto({ id: 'a', nombre: 'Espresso' }), producto({ id: 'b', nombre: 'Flat white' })];
  const ctx = { catalogo, rubro: 'Café' as const, unidad: 'u' as const, idActual: 'a' };

  it('alerta vacía = la del local; con valor, la propia', () => {
    const vacia = validarProducto({ nombre: 'Espresso', precio: '2200', alerta: '', activo: true, controlStock: true }, ctx);
    expect(vacia).toEqual({ ok: true, valor: { nombre: 'Espresso', precio: 2200, alerta: null, activo: true, controlStock: true, rubro: ctx.rubro } });
    const propia = validarProducto({ nombre: 'Espresso', precio: '2200', alerta: '8', activo: false, controlStock: true }, ctx);
    expect(propia.ok && propia.valor.alerta).toBe(8);
  });

  it('no deja renombrar a un nombre que ya existe en el rubro', () => {
    const r = validarProducto({ nombre: 'flat white', precio: '2200', alerta: '', activo: true, controlStock: true }, ctx);
    expect(r.ok).toBe(false);
  });

  it('solo los servicios pueden valer $0', () => {
    expect(validarProducto({ nombre: 'Espresso', precio: '0', alerta: '', activo: true, controlStock: true }, ctx).ok).toBe(false);
    const servicio = validarProducto({ nombre: 'Cortesía juez', precio: '0', alerta: '', activo: true, controlStock: false }, { ...ctx, rubro: 'Mesa', idActual: null });
    expect(servicio.ok).toBe(true);
  });
});

describe('caja del día', () => {
  const hoy = new Date(2026, 8, 24, 20, 0);

  function venta(parcial: Partial<VentaCaja> & Pick<VentaCaja, 'id' | 'fecha'>): VentaCaja {
    return {
      mesaNum: 1,
      items: [],
      subtotal: 0,
      creditoAplicado: 0,
      total: 0,
      medioPago: 'efectivo',
      hora: '12:00',
      creadoEnMs: null,
      ...parcial,
    };
  }

  it('normalizarVenta completa las ventas viejas sin subtotal ni medio de pago', () => {
    const v = normalizarVenta('v1', {
      mesaNum: 4,
      total: 6400,
      fecha: '2026-09-24',
      hora: '19:31',
      items: [{ itemId: 'a', nombre: 'Flat white', precio: 3200, cantidad: 2, rubro: 'Café', origen: 'productos' }],
    });
    expect(v.subtotal).toBe(6400);
    expect(v.creditoAplicado).toBe(0);
    expect(v.medioPago).toBeNull();
    expect(v.items).toHaveLength(1);
    expect(normalizarVenta('v2', { medioPago: 'bitcoin' }).medioPago).toBeNull();
    expect(normalizarVenta('v3', { medioPago: 'credito_torneo' }).medioPago).toBe('credito_torneo');
  });

  it('resume el día: total cobrado, cobros, ticket, crédito, rubros, medios y variación', () => {
    const ventas: VentaCaja[] = [
      venta({
        id: '1',
        fecha: '2026-09-24',
        hora: '19:31',
        mesaNum: 4,
        subtotal: 10000,
        creditoAplicado: 4000,
        total: 6000,
        medioPago: 'qr',
        items: [
          { itemId: 'a', nombre: 'Flat white', precio: 3000, cantidad: 2, rubro: 'Café', origen: 'productos' },
          { itemId: 'b', nombre: 'Sobre', precio: 4000, cantidad: 1, rubro: 'TCG', origen: 'tcg' },
        ],
      }),
      venta({
        id: '2',
        fecha: '2026-09-24',
        hora: '20:05',
        mesaNum: 8,
        subtotal: 2000,
        total: 2000,
        medioPago: 'efectivo',
        items: [{ itemId: 'c', nombre: 'Medialuna', precio: 1000, cantidad: 2, rubro: 'Pastelería', origen: 'productos' }],
      }),
      venta({ id: '3', fecha: '2026-09-17', subtotal: 4000, total: 4000 }),
      venta({ id: '4', fecha: '2026-09-20', subtotal: 1000, total: 1000 }),
    ];
    const r = resumirCaja(ventas, hoy);
    expect(r.fecha).toBe('2026-09-24');
    expect(r.totalHoy).toBe(8000);
    expect(r.cobros).toBe(2);
    expect(r.ticketPromedio).toBe(6000);
    expect(r.creditoAplicado).toBe(4000);
    expect(r.variacionPct).toBe(100);
    expect(r.barras).toHaveLength(7);
    expect(r.barras[6]).toEqual({ fecha: '2026-09-24', letra: 'J', total: 8000, esHoy: true });
    expect(r.barras[0].fecha).toBe('2026-09-18');
    expect(r.barras.find((b) => b.fecha === '2026-09-20')?.total).toBe(1000);
    expect(r.porRubro.map((f) => [f.clave, f.total, f.pct])).toEqual([
      ['Café', 6000, 50],
      ['TCG', 4000, 33],
      ['Pastelería', 2000, 17],
    ]);
    expect(r.porMedio.map((f) => [f.nombre, f.total, f.pct, f.tono])).toEqual([
      ['QR', 6000, 50, 'ink'],
      ['Efectivo', 2000, 17, 'ink'],
      ['Crédito de torneo', 4000, 33, 'gold'],
    ]);
    expect(r.ultimos.map((v) => v.id)).toEqual(['2', '1']);
  });

  it('con el día en curso compara contra la semana pasada hasta la misma hora', () => {
    const ventas = [
      venta({ id: '1', fecha: '2026-09-24', hora: '18:00', subtotal: 5000, total: 5000 }),
      venta({ id: '2', fecha: '2026-09-17', hora: '17:00', subtotal: 5000, total: 5000 }),
      venta({ id: '3', fecha: '2026-09-17', hora: '22:00', subtotal: 20000, total: 20000 }),
    ];
    // A las 18:30 de hoy: la semana pasada a esa hora llevaba .000, no los 5.000 del día completo.
    expect(resumirCaja(ventas, hoy, { hastaMinuto: 18 * 60 + 30 }).variacionPct).toBe(0);
    expect(resumirCaja(ventas, hoy).variacionPct).toBe(-80);
  });

  it('una venta vieja (sin medio de pago) toma fecha y hora locales de su marca de tiempo, no la fecha UTC', () => {
    const marca = new Date(2026, 8, 24, 22, 15);
    const v = normalizarVenta('v1', { total: 3000, fecha: '2026-09-25', items: [], creadoEn: { toMillis: () => marca.getTime() } });
    expect(v.fecha).toBe('2026-09-24');
    expect(v.hora).toBe('22:15');
  });

  it('sin ventas el mismo día de la semana pasada no inventa una variación', () => {
    const r = resumirCaja([venta({ id: '1', fecha: '2026-09-24', subtotal: 500, total: 500 })], hoy);
    expect(r.variacionPct).toBeNull();
  });

  it('un día sin cobros da todo en cero', () => {
    const r = resumirCaja([], hoy);
    expect(r.totalHoy).toBe(0);
    expect(r.cobros).toBe(0);
    expect(r.ticketPromedio).toBe(0);
    expect(r.porRubro).toEqual([]);
    expect(r.porMedio).toEqual([]);
    expect(r.barras.every((b) => b.total === 0)).toBe(true);
  });

  it('una cuenta pagada entera con crédito no aparece como medio con $0', () => {
    const r = resumirCaja(
      [venta({ id: '1', fecha: '2026-09-24', subtotal: 3000, creditoAplicado: 3000, total: 0, medioPago: 'credito_torneo' })],
      hoy
    );
    expect(r.totalHoy).toBe(0);
    expect(r.porMedio).toEqual([{ clave: 'credito_torneo', nombre: 'Crédito de torneo', total: 3000, pct: 100, tono: 'gold' }]);
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

async function tocarControl(r: RenderPrueba, etiqueta: string | RegExp): Promise<void> {
  const nodo = control(r, etiqueta);
  await act(async () => {
    (nodo.props.onPress as () => void)();
  });
}

async function escribir(r: RenderPrueba, etiquetaCampo: string, valor: string): Promise<void> {
  const campo = r.root.findAll((n) => n.props.label === etiquetaCampo && typeof n.props.onChangeText === 'function')[0];
  if (!campo) throw new Error(`No hay un campo "${etiquetaCampo}"`);
  await act(async () => {
    (campo.props.onChangeText as (t: string) => void)(valor);
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

function reiniciarDatos(): void {
  jest.clearAllMocks();
  for (const k of Object.keys(mockColecciones)) delete mockColecciones[k];
  mockBatches.length = 0;
  mockAuto = 0;
  mockConfig = CONFIG_DEFAULT;
  mockPerfil = { uid: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' };
  mockColecciones.productos = [
    { id: 'esp', nombre: 'Espresso', precio: 2200, rubro: 'Café', controlStock: true, stock: 40 },
    { id: 'grano', nombre: 'Café en grano', precio: 30000, rubro: 'Café', controlStock: true, stock: 4.2, unidad: 'kg', alerta: 2 },
    { id: 'med', nombre: 'Medialuna', precio: 1400, rubro: 'Pastelería', controlStock: true, stock: 1 },
    { id: 'agua', nombre: 'Agua', precio: 1200, rubro: 'Mesa', controlStock: false },
    { id: 'viejo', nombre: 'Tostado', precio: 3000, rubro: 'Café', controlStock: true, stock: 0, activo: false },
  ];
  mockColecciones.tcg_productos = [{ id: 'sobre', nombre: 'Sobre Surging Sparks', valor: 7500, stock: 32 }];
}

describe('pantalla Stock', () => {
  beforeEach(reiniciarDatos);

  it('el mozo ve solo cafetería y pastelería, sin ingreso de mercadería', async () => {
    mockPerfil = { ...mockPerfil, role: 'mozo' };
    const r = await montar(React.createElement(StockScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Stock cafetería');
    expect(texto).toContain('Medialuna');
    expect(texto).not.toContain('Sobre Surging Sparks');
    expect(() => control(r, '+ Ingreso')).toThrow();
    expect(() => control(r, 'Servicios')).toThrow();
    await desmontar(r);
  });

  it('el juez ve solo TCG', async () => {
    mockPerfil = { ...mockPerfil, role: 'juez' };
    const r = await montar(React.createElement(StockScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Stock TCG');
    expect(texto).toContain('Sobre Surging Sparks');
    expect(texto).not.toContain('Espresso');
    await desmontar(r);
  });

  it('el admin ve el depósito completo con alertas, pausados y servicios aparte', async () => {
    const r = await montar(React.createElement(StockScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Depósito');
    expect(texto).toContain('1 con stock bajo');
    expect(texto).toContain('PAUSADO');
    expect(texto).not.toContain('Agua');
    await tocarControl(r, 'Servicios');
    expect(textoDe(r)).toContain('Agua');
    await desmontar(r);
  });

  it('ingresa mercadería de un producto existente con increment y renglón de ingreso', async () => {
    const r = await montar(React.createElement(StockScreen));
    await tocarControl(r, '+ Ingreso');
    expect(textoDe(r)).toContain('INGRESO DE MERCADERÍA · SOLO ADMIN');
    await tocarControl(r, 'Guardar ingreso');
    expect(textoDe(r)).toContain('Elegí qué producto entró.');
    expect(mockBatches).toHaveLength(0);
    await escribir(r, 'Buscar producto', 'grano');
    await tocarControl(r, 'Elegir Café en grano');
    await escribir(r, 'Cantidad (kg)', '2,5');
    await escribir(r, 'Costo unitario ($)', '18.000');
    await tocarControl(r, 'Guardar ingreso');
    expect(mockBatches).toHaveLength(1);
    expect(mockBatches[0][0]).toEqual({ op: 'update', path: 'productos/grano', datos: { stock: { incremento: 2.5 } } });
    expect(mockBatches[0][1]).toMatchObject({
      op: 'set',
      datos: {
        productoId: 'grano',
        coleccion: 'productos',
        nombre: 'Café en grano',
        rubro: 'Café',
        cantidad: 2.5,
        unidad: 'kg',
        costoUnitario: 18000,
        fecha: fechaLocal(),
        creadoPor: 'yo',
        creadoEn: 'TS',
      },
    });
    expect(mockMostrar).toHaveBeenCalledWith('Ingresaron 2,5 kg de Café en grano', 'ok');
    await desmontar(r);
  });

  it('da de alta un producto TCG nuevo en tcg_productos con valor', async () => {
    const r = await montar(React.createElement(StockScreen));
    await tocarControl(r, '+ Ingreso');
    await tocarControl(r, 'Producto nuevo');
    await escribir(r, 'Nombre', 'Deckbox 100+');
    await tocarControl(r, 'TCG');
    await escribir(r, 'Precio de venta ($)', '9800');
    await escribir(r, 'Cantidad (u)', '7');
    await escribir(r, 'Costo unitario ($)', '5000');
    await tocarControl(r, 'Guardar ingreso');
    const [alta, ingreso] = mockBatches[0];
    expect(alta.path).toMatch(/^tcg_productos\//);
    expect(alta.datos).toEqual({ nombre: 'Deckbox 100+', valor: 9800, stock: 7, unidad: 'u', activo: true, creadoEn: 'TS' });
    expect(ingreso.datos).toMatchObject({ productoId: alta.path.split('/')[1], coleccion: 'tcg_productos', rubro: 'TCG', cantidad: 7 });
    await desmontar(r);
  });

  it('edita un producto: alerta vacía vuelve a la del local', async () => {
    const r = await montar(React.createElement(StockScreen));
    await tocarControl(r, /^Café en grano, /);
    await escribir(r, 'Precio ($)', '32.000');
    await escribir(r, 'Alerta propia (kg)', '');
    await tocarControl(r, 'Guardar cambios');
    expect(mockUpdateDoc).toHaveBeenCalledWith('productos/grano', {
      nombre: 'Café en grano',
      precio: 32000,
      alerta: 'BORRAR',
      activo: true,
      controlStock: true,
      rubro: 'Café',
    });
    await desmontar(r);
  });

  it('un producto de cafetería puede cambiar de rubro', async () => {
    const r = await montar(React.createElement(StockScreen));
    await tocarControl(r, /^Café en grano, /);
    await tocarControl(r, 'Rubro Pastelería');
    await tocarControl(r, 'Guardar cambios');
    expect(mockUpdateDoc).toHaveBeenCalledWith('productos/grano', expect.objectContaining({ rubro: 'Pastelería' }));
    await desmontar(r);
  });

  it('crea un servicio de mesa sin control de stock', async () => {
    const r = await montar(React.createElement(StockScreen));
    await tocarControl(r, 'Servicios');
    await tocarControl(r, '+ Servicio');
    await escribir(r, 'Nombre', 'Alquiler mesa 1h');
    await escribir(r, 'Precio ($)', '3000');
    await tocarControl(r, 'Crear servicio');
    expect(mockAddDoc).toHaveBeenCalledWith('productos', {
      nombre: 'Alquiler mesa 1h',
      precio: 3000,
      rubro: 'Mesa',
      controlStock: false,
      activo: true,
      creadoEn: 'TS',
    });
    await desmontar(r);
  });
});

describe('pantalla Caja', () => {
  beforeEach(reiniciarDatos);

  it('solo el admin entra', async () => {
    mockPerfil = { ...mockPerfil, role: 'mozo' };
    const r = await montar(React.createElement(CajaScreen));
    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/hoy');
    await desmontar(r);
  });

  it('arma el cierre con lo cobrado hoy', async () => {
    const hoy = fechaLocal();
    mockColecciones.ventas = [
      {
        id: 'v1',
        mesaId: 'm4',
        mesaNum: 4,
        items: [{ itemId: 'a', nombre: 'Flat white', precio: 3000, cantidad: 2, rubro: 'Café', origen: 'productos' }],
        subtotal: 6000,
        creditoAplicado: 0,
        creditoUid: null,
        total: 6000,
        medioPago: 'qr',
        fecha: hoy,
        hora: '19:31',
      },
      {
        id: 'v2',
        mesaId: 'm8',
        mesaNum: 8,
        items: [{ itemId: 'b', nombre: 'Medialuna', precio: 1000, cantidad: 2, rubro: 'Pastelería', origen: 'productos' }],
        subtotal: 2000,
        creditoAplicado: 0,
        creditoUid: null,
        total: 2000,
        medioPago: 'efectivo',
        fecha: hoy,
        hora: '20:05',
      },
      { id: 'v3', mesaNum: 1, items: [], subtotal: 4000, creditoAplicado: 0, total: 4000, medioPago: 'efectivo', fecha: fechaLocal(sumarDias(new Date(), -7)), hora: '19:00' },
    ];
    const r = await montar(React.createElement(CajaScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Cierre del día');
    expect(texto).toContain('$8.000');
    expect(r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && /^100% más que el .+ pasado$/.test(n.props.accessibilityLabel)).length).toBeGreaterThan(0);
    expect(texto).toContain('POR RUBRO');
    expect(texto).toContain('POR MEDIO DE PAGO');
    expect(r.root.findAll((n) => n.props.accessibilityLabel === '20:05, mesa 08, Efectivo, $2.000').length).toBeGreaterThan(0);
    await desmontar(r);
  });

  it('un día sin cobros lo dice en vez de mostrar tablas vacías', async () => {
    mockColecciones.ventas = [];
    const r = await montar(React.createElement(CajaScreen));
    const texto = textoDe(r);
    expect(texto).toContain('Todavía no se cobró nada hoy');
    expect(texto).not.toContain('POR RUBRO');
    await desmontar(r);
  });
});
