import React, { act } from 'react';
import { Alert, AlertButton, Switch } from 'react-native';
import { CONFIG_DEFAULT, ConfigLocal } from '../lib/config';
import AjustesScreen from '../app/(tabs)/ajustes/index';
import EquipoScreen from '../app/(tabs)/ajustes/equipo';

// Prueba de humo de las pantallas de Ajustes y Equipo con Firebase y contextos simulados.

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

interface RendererApi {
  create(el: React.ReactElement): RenderPrueba;
}

// Sin @types/react-test-renderer instalado: se tipa acá lo poco que se usa.
const renderer: RendererApi = require('react-test-renderer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Filtro = { campo: string; op: string; valor: unknown };
type RefFalsa = { tipo: 'doc'; path: string } | { tipo: 'col'; nombre: string } | { tipo: 'query'; filtros: Filtro[] };
type DocFalso = { id: string } & Record<string, unknown>;

const mockGuardarConfig = jest.fn((_cambios: Partial<ConfigLocal>) => Promise.resolve());
const mockMostrar = jest.fn();
const mockPush = jest.fn();
const mockUpdateDoc = jest.fn((_ref: RefFalsa, _datos: Record<string, unknown>) => Promise.resolve());
const mockSetDoc = jest.fn((_ref: RefFalsa, _datos: Record<string, unknown>, _op?: unknown) => Promise.resolve());

let mockConfig: ConfigLocal = CONFIG_DEFAULT;
let mockPerfil = { uid: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' };
let mockCodigo: string | null = 'ABCD2345';

const mockPendientes: DocFalso[] = [
  { id: 'p1', nombre: 'Martina Gómez', email: 'martina@mail.com', role: 'mozo', estadoAprobacion: 'pendiente', creadoEn: Date.now() - 2 * 3600_000 - 60_000 },
];
const mockStaff: DocFalso[] = [
  { id: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' },
  { id: 'l1', nombre: 'Lucía P.', email: 'lucia@mail.com', role: 'mozo', estadoAprobacion: 'aprobado' },
  { id: 'j1', nombre: 'Juan C.', email: 'juan@mail.com', role: 'juez', estadoAprobacion: 'aprobado' },
  { id: 'r1', nombre: 'Nico R.', email: 'nico@mail.com', role: 'juez', estadoAprobacion: 'rechazado' },
  { id: 'p1', nombre: 'Martina Gómez', email: 'martina@mail.com', role: 'mozo', estadoAprobacion: 'pendiente' },
];

jest.mock('../config/firebase', () => ({ db: {}, auth: {}, storage: {} }));

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...partes: string[]) => ({ tipo: 'doc', path: partes.join('/') }),
  collection: (_db: unknown, nombre: string) => ({ tipo: 'col', nombre }),
  where: (campo: string, op: string, valor: unknown) => ({ campo, op, valor }),
  query: (_col: unknown, ...filtros: Filtro[]) => ({ tipo: 'query', filtros }),
  onSnapshot: (ref: RefFalsa, next: (snap: unknown) => void) => {
    if (ref.tipo === 'doc') {
      next({ exists: () => mockCodigo !== null, data: () => (mockCodigo ? { codigoInvitacion: mockCodigo } : undefined) });
    } else if (ref.tipo === 'query') {
      const lista = ref.filtros[0]?.campo === 'estadoAprobacion' ? mockPendientes : mockStaff;
      next({ docs: lista.map(({ id, ...datos }) => ({ id, data: () => datos })) });
    }
    return () => undefined;
  },
  setDoc: (ref: RefFalsa, datos: Record<string, unknown>, op?: unknown) => mockSetDoc(ref, datos, op),
  updateDoc: (ref: RefFalsa, datos: Record<string, unknown>) => mockUpdateDoc(ref, datos),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// La sección de jugadores tiene su propio test (jugadores-equipo.test.tsx).
jest.mock('../components/JugadoresEquipo', () => () => null);

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 53 + 7) % 256),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: () => Promise.resolve(),
  notificationAsync: () => Promise.resolve(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('../contexts/UserProfileContext', () => ({
  useUserProfileContext: () => ({ user: { uid: mockPerfil.uid }, profile: mockPerfil, loading: false, error: null, reintentar: () => undefined }),
}));

jest.mock('../contexts/ConfigContext', () => ({
  useConfig: () => ({ config: mockConfig, cargando: false, guardarConfig: mockGuardarConfig }),
}));

jest.mock('../contexts/ThemeContext', () => {
  const { getTheme } = jest.requireActual<typeof import('../constants/theme')>('../constants/theme');
  const colors = getTheme('day');
  return {
    useTheme: () => ({ mode: 'day', colors, preferencia: 'auto', setPreferencia: () => undefined, toggleMode: () => undefined }),
  };
});

jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ mostrar: mockMostrar }) }));

function textoDe(r: RenderPrueba): string {
  return JSON.stringify(r.toJSON());
}

function tocable(r: RenderPrueba, etiqueta: string): NodoPrueba {
  const nodo = r.root.findAll((n) => n.props.accessibilityLabel === etiqueta && typeof n.props.onPress === 'function')[0];
  if (!nodo) throw new Error(`No hay un control "${etiqueta}"`);
  return nodo;
}

async function tocar(r: RenderPrueba, etiqueta: string): Promise<void> {
  const nodo = tocable(r, etiqueta);
  await act(async () => {
    (nodo.props.onPress as () => void)();
  });
}

async function montar(el: React.ReactElement): Promise<RenderPrueba> {
  let r: RenderPrueba | null = null;
  await act(async () => {
    r = renderer.create(el);
  });
  if (!r) throw new Error('No se montó');
  return r;
}

async function desmontar(r: RenderPrueba): Promise<void> {
  await act(async () => {
    r.unmount();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig = CONFIG_DEFAULT;
  mockPerfil = { uid: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' };
  mockCodigo = 'ABCD2345';
});

describe('Ajustes', () => {
  it('no deja entrar a quien no es admin', async () => {
    mockPerfil = { ...mockPerfil, role: 'mozo' };
    const r = await montar(<AjustesScreen />);
    expect(textoDe(r)).toContain('Solo el admin entra acá');
    expect(textoDe(r)).not.toContain('Turnos y horarios');
    await desmontar(r);
  });

  it('muestra todas las secciones y el contador de pendientes', async () => {
    const r = await montar(<AjustesScreen />);
    const texto = textoDe(r);
    for (const seccion of ['Ajustes del local', 'COLOR DE LA MARCA', 'Apariencia', 'Turnos y horarios', 'Stock', 'Torneos', 'Cobro', 'Temporada', 'Equipo']) {
      expect(texto).toContain(seccion);
    }
    expect(texto).toContain('1 PENDIENTE');
    expect(texto).toContain('Cuentan todos los torneos');
    await tocar(r, 'Equipo. Una persona espera tu aprobación');
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/ajustes/equipo');
    await desmontar(r);
  });

  it('elige color de marca y vuelve al de por defecto', async () => {
    const r = await montar(<AjustesScreen />);
    await tocar(r, 'Color verde');
    expect(mockGuardarConfig).toHaveBeenCalledWith({ marca: '#3F6B58' });
    await desmontar(r);

    mockConfig = { ...CONFIG_DEFAULT, marca: '#3F6B58' };
    const r2 = await montar(<AjustesScreen />);
    await tocar(r2, 'Por defecto');
    expect(mockGuardarConfig).toHaveBeenLastCalledWith({ marca: null });
    await desmontar(r2);
  });

  it('guarda los toggles al instante', async () => {
    const r = await montar(<AjustesScreen />);
    const toggle = r.root.findAll((n) => n.type === Switch && n.props.accessibilityLabel === 'Cobrar descuenta stock')[0];
    await act(async () => {
      (toggle.props.onValueChange as (v: boolean) => void)(false);
    });
    expect(mockGuardarConfig).toHaveBeenCalledWith({ descontarStock: false });
    expect(mockMostrar).toHaveBeenCalledWith('Guardado', 'ok');
    await desmontar(r);
  });

  it('agrupa varios toques del stepper en un solo guardado', async () => {
    jest.useFakeTimers();
    try {
      const r = await montar(<AjustesScreen />);
      await tocar(r, 'Sumar Rondas');
      await tocar(r, 'Sumar Rondas');
      await tocar(r, 'Sumar Rondas');
      expect(mockGuardarConfig).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(700);
      });
      expect(mockGuardarConfig).toHaveBeenCalledTimes(1);
      // Solo el campo que cambió: si se copiara el resto, dos cambios casi simultáneos se pisarían.
      expect(mockGuardarConfig).toHaveBeenCalledWith({ torneo: { rondas: CONFIG_DEFAULT.torneo.rondas + 3 } });
      await desmontar(r);
    } finally {
      jest.useRealTimers();
    }
  });

  it('no guarda turnos superpuestos', async () => {
    const r = await montar(<AjustesScreen />);
    const cierre = r.root.findAll(
      (n) => n.props.accessibilityLabel === 'Hora de cierre del turno 1, en formato horas y minutos' && typeof n.props.onChangeText === 'function'
    )[0];
    await act(async () => {
      (cierre.props.onChangeText as (t: string) => void)('16:00');
    });
    await tocar(r, 'Guardar turnos');
    expect(mockGuardarConfig).not.toHaveBeenCalled();
    expect(textoDe(r)).toContain('se superponen');
    await desmontar(r);
  });

  it('valida el nombre del local', async () => {
    const r = await montar(<AjustesScreen />);
    await tocar(r, 'Editar el nombre del local');
    const campo = r.root.findAll((n) => n.props.accessibilityLabel === 'Nombre del local' && typeof n.props.onChangeText === 'function')[0];
    await act(async () => {
      (campo.props.onChangeText as (t: string) => void)('   ');
    });
    await tocar(r, 'Guardar');
    expect(mockGuardarConfig).not.toHaveBeenCalled();
    expect(textoDe(r)).toContain('Escribí el nombre del local.');

    await act(async () => {
      (campo.props.onChangeText as (t: string) => void)('  Duel   Palermo ');
    });
    await tocar(r, 'Guardar');
    expect(mockGuardarConfig).toHaveBeenCalledWith({ nombreLocal: 'Duel Palermo' });
    await desmontar(r);
  });
});

describe('Equipo', () => {
  it('no deja entrar a quien no es admin', async () => {
    mockPerfil = { ...mockPerfil, role: 'juez' };
    const r = await montar(<EquipoScreen />);
    expect(textoDe(r)).toContain('Solo el admin entra acá');
    await desmontar(r);
  });

  it('muestra código, solicitudes, activos y sin acceso', async () => {
    const r = await montar(<EquipoScreen />);
    const texto = textoDe(r);
    expect(texto).toContain('ABCD2345');
    expect(texto).toContain('ESPERANDO APROBACIÓN');
    expect(texto).toContain('Pide entrar como mozo · hace 2 h');
    expect(texto).toContain('Sos vos');
    expect(texto).toContain('Lucía P.');
    expect(texto).not.toContain('Nico R.');

    await tocar(r, 'Sin acceso, 1 persona');
    expect(textoDe(r)).toContain('Nico R.');

    await tocar(r, 'Aprobar como mozo');
    expect(mockUpdateDoc).toHaveBeenCalledWith({ tipo: 'doc', path: 'users/p1' }, { estadoAprobacion: 'aprobado' });

    await tocar(r, 'Reactivar');
    expect(mockUpdateDoc).toHaveBeenLastCalledWith({ tipo: 'doc', path: 'users/r1' }, { estadoAprobacion: 'aprobado' });
    await desmontar(r);
  });

  it('no deja tocar la propia cuenta y abre opciones para el resto', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await montar(<EquipoScreen />);
    const propia = r.root.findAll(
      (n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Fabri, Admin') && typeof n.props.onPress === 'function'
    )[0];
    expect(propia.props.disabled).toBe(true);

    await tocar(r, 'Lucía P., Mozo. lucia@mail.com');
    expect(alerta).toHaveBeenCalledTimes(1);
    const botones = alerta.mock.calls[0][2] as AlertButton[];
    expect(botones.length).toBeLessThanOrEqual(3);

    await act(async () => {
      botones.find((b) => b.text === 'Cambiar rol')?.onPress?.();
    });
    const botonesRol = alerta.mock.calls[1][2] as AlertButton[];
    expect(botonesRol.map((b) => b.text)).toEqual(['Cancelar', 'Pasar a Admin', 'Pasar a Juez']);

    await act(async () => {
      botonesRol.find((b) => b.text === 'Pasar a Juez')?.onPress?.();
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith({ tipo: 'doc', path: 'users/l1' }, { role: 'juez' });

    await act(async () => {
      botonesRol.find((b) => b.text === 'Pasar a Admin')?.onPress?.();
    });
    expect(alerta.mock.calls[2][0]).toBe('¿Hacer admin a Lucía P.?');
    alerta.mockRestore();
    await desmontar(r);
  });

  it('genera un código nuevo pidiendo confirmación si ya había uno', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r = await montar(<EquipoScreen />);
    await tocar(r, 'Generar código nuevo');
    expect(mockSetDoc).not.toHaveBeenCalled();
    const botones = alerta.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      botones.find((b) => b.text === 'Generar')?.onPress?.();
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, datos, op] = mockSetDoc.mock.calls[0];
    expect(ref).toEqual({ tipo: 'doc', path: 'config/privado' });
    expect(String(datos.codigoInvitacion)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // Vence en una semana: un código filtrado no sirve para siempre.
    const vence = (datos.codigoVenceEn as { toMillis: () => number }).toMillis() - Date.now();
    expect(vence).toBeGreaterThan(6.9 * 86_400_000);
    expect(vence).toBeLessThanOrEqual(7 * 86_400_000 + 1000);
    expect(op).toEqual({ merge: true });
    alerta.mockRestore();
    await desmontar(r);
  });

  it('sin código avisa que mozo y juez no pueden registrarse', async () => {
    mockCodigo = null;
    const r = await montar(<EquipoScreen />);
    expect(textoDe(r)).toContain('Sin código: mozo y juez no pueden registrarse todavía.');
    await desmontar(r);
  });
});
