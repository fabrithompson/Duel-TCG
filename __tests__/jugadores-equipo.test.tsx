import React, { act } from 'react';
import { Alert, type AlertButton } from 'react-native';
import JugadoresEquipo from '../components/JugadoresEquipo';

// Prueba de QA: el admin bloquea y reactiva cuentas de jugador sin borrar nada.

interface NodoPrueba {
  props: Record<string, unknown>;
  findAll(pred: (n: NodoPrueba) => boolean): NodoPrueba[];
}

interface RenderPrueba {
  root: NodoPrueba;
  toJSON(): unknown;
  unmount(): void;
}

const renderer: { create(el: React.ReactElement): RenderPrueba } = require('react-test-renderer');
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Filtro = { campo?: string; op?: string; valor?: unknown };
type DocFalso = { id: string } & Record<string, unknown>;

const mockJugadores: DocFalso[] = [];
const mockLotes: { op: string; path: string; datos: Record<string, unknown> }[][] = [];
const mockMostrar = jest.fn();

jest.mock('../config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ nombre }),
  doc: (_db: unknown, ...partes: string[]) => ({ path: partes.join('/') }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  orderBy: () => ({}),
  limit: () => ({}),
  query: (col: { nombre: string }, ...filtros: Filtro[]) => ({ nombre: col.nombre, filtros }),
  onSnapshot: (q: { filtros: Filtro[] }, next: (snap: unknown) => void) => {
    const soloBloqueados = q.filtros.some((f) => f.campo === 'activo' && f.valor === false);
    const lista = mockJugadores.filter((j) => (soloBloqueados ? j.activo === false : true));
    next({ docs: lista.map(({ id, ...datos }) => ({ id, data: () => datos })) });
    return () => undefined;
  },
  writeBatch: () => {
    const ops: { op: string; path: string; datos: Record<string, unknown> }[] = [];
    mockLotes.push(ops);
    return {
      update: (ref: { path: string }, datos: Record<string, unknown>) => ops.push({ op: 'update', path: ref.path, datos }),
      commit: () => Promise.resolve(),
    };
  },
}));
jest.mock('../contexts/ThemeContext', () => {
  const { getTheme } = jest.requireActual<typeof import('../constants/theme')>('../constants/theme');
  return { useTheme: () => ({ colors: getTheme('day') }) };
});
jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ mostrar: mockMostrar }) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

function textoDe(r: RenderPrueba): string {
  return JSON.stringify(r.toJSON());
}

function control(r: RenderPrueba, etiqueta: string): NodoPrueba {
  const nodo = r.root.findAll((n) => n.props.accessibilityLabel === etiqueta && typeof n.props.onPress === 'function')[0];
  if (!nodo) throw new Error(`No hay un control "${etiqueta}"`);
  return nodo;
}

async function montar(): Promise<RenderPrueba> {
  let r: RenderPrueba | null = null;
  await act(async () => {
    r = renderer.create(<JugadoresEquipo />);
  });
  if (!r) throw new Error('No se montó');
  return r;
}

beforeEach(() => {
  mockJugadores.length = 0;
  mockLotes.length = 0;
  mockMostrar.mockClear();
  mockJugadores.push(
    { id: 'a1', nombre: 'Ana Ríos', nombreBusqueda: 'ana rios', creditoCafeteria: 3000 },
    { id: 'b1', nombre: 'Bot Falso', nombreBusqueda: 'bot falso', creditoCafeteria: 0, activo: false }
  );
});

describe('Jugadores en Equipo', () => {
  it('lista activos y bloqueados por separado', async () => {
    const r = await montar();
    const texto = textoDe(r);
    expect(texto).toContain('Ana Ríos');
    expect(texto).toContain('Crédito $3.000');
    expect(texto).toContain('BLOQUEADOS');
    expect(texto).toContain('Bot Falso');
    act(() => r.unmount());
  });

  it('bloquear pide confirmación y quita el acceso sin borrar el crédito', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await montar();
    await act(async () => {
      (control(r, 'Bloquear').props.onPress as () => void)();
    });
    expect(mockLotes).toHaveLength(0);
    const botones = alerta.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      botones.find((b) => b.text === 'Bloquear')?.onPress?.();
    });
    expect(mockLotes[0]).toEqual([
      { op: 'update', path: 'users/a1', datos: { estadoAprobacion: 'rechazado' } },
      { op: 'update', path: 'jugadores/a1', datos: { activo: false } },
    ]);
    expect(mockMostrar).toHaveBeenCalledWith('Ana Ríos quedó bloqueado', 'ok');
    alerta.mockRestore();
    act(() => r.unmount());
  });

  it('reactivar devuelve el acceso', async () => {
    const r = await montar();
    await act(async () => {
      (control(r, 'Reactivar').props.onPress as () => void)();
    });
    expect(mockLotes[0]).toEqual([
      { op: 'update', path: 'users/b1', datos: { estadoAprobacion: 'aprobado' } },
      { op: 'update', path: 'jugadores/b1', datos: { activo: true } },
    ]);
    act(() => r.unmount());
  });
});
