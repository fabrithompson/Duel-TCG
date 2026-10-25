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
const mockCrearCuenta = jest.fn((_alta: Record<string, unknown>, _adminUid: string) => Promise.resolve('nuevo'));

let mockConfig: ConfigLocal = CONFIG_DEFAULT;
let mockPerfil = { uid: 'yo', nombre: 'Fabri', email: 'fabri@duel.com', role: 'admin', estadoAprobacion: 'aprobado' };
let mockPorEmail: DocFalso[] = [];

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
      next({ exists: () => false, data: () => undefined });
    } else if (ref.tipo === 'query') {
      const lista = ref.filtros[0]?.campo === 'estadoAprobacion' ? mockPendientes : mockStaff;
      next({ docs: lista.map(({ id, ...datos }) => ({ id, data: () => datos })) });
    }
    return () => undefined;
  },
  getDocs: () => Promise.resolve({ docs: mockPorEmail.map(({ id, ...datos }) => ({ id, data: () => datos })) }),
  limit: (n: number) => ({ campo: 'limit', op: 'limit', valor: n }),
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

jest.mock('../lib/altaEquipo', () => ({
  crearCuentaEquipo: (alta: Record<string, unknown>, adminUid: string) => mockCrearCuenta(alta, adminUid),
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
  mockPorEmail = [];
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
    for (const seccion of ['Ajustes del local', 'Turnos y horarios', 'Stock', 'Torneos', 'Cobro', 'Temporada', 'Equipo']) {
      expect(texto).toContain(seccion);
    }
    // Personalización básica: nombre y logo. Ni color de marca ni modo noche del local.
    for (const quitado of ['COLOR DE LA MARCA', 'Apariencia', 'Modo noche por defecto']) {
      expect(texto).not.toContain(quitado);
    }
    expect(texto).toContain('1 PENDIENTE');
    expect(texto).toContain('Sin fecha');
    await tocar(r, 'Equipo, 1 pendiente');
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/ajustes/equipo');
    await desmontar(r);
  });

  it('el logo se cambia desde Editar, junto con el nombre', async () => {
    const r = await montar(<AjustesScreen />);
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Cargar logo')).toHaveLength(0);
    await tocar(r, 'Editar nombre y logo del local');
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Cargar logo').length).toBeGreaterThan(0);
    // Sin logo propio no hay a qué volver.
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Usar el de Duel')).toHaveLength(0);
    await desmontar(r);

    mockConfig = { ...CONFIG_DEFAULT, logoUrl: 'https://logo.test/l.png' };
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const r2 = await montar(<AjustesScreen />);
    await tocar(r2, 'Editar nombre y logo del local');
    await tocar(r2, 'Usar el de Duel');
    // Borra el logo propio: primero pregunta.
    expect(mockGuardarConfig).not.toHaveBeenCalled();
    const botones = alerta.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      botones.find((b) => b.style === 'destructive')?.onPress?.();
    });
    expect(mockGuardarConfig).toHaveBeenCalledWith({ logoUrl: null });
    alerta.mockRestore();
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
    await tocar(r, 'Editar nombre y logo del local');
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

  it('muestra solicitudes que quedaron, activos y sin acceso', async () => {
    const r = await montar(<EquipoScreen />);
    const texto = textoDe(r);
    expect(texto).not.toContain('Código');
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

  async function completarAlta(r: RenderPrueba, datos: { nombre: string; email: string; password: string }): Promise<void> {
    await tocar(r, 'Sumar al equipo');
    const campos: [string, string][] = [
      ['Nombre y apellido', datos.nombre],
      ['Email', datos.email],
      ['Contraseña', datos.password],
    ];
    for (const [etiqueta, valor] of campos) {
      const campo = r.root.findAll((n) => n.props.accessibilityLabel === etiqueta && typeof n.props.onChangeText === 'function')[0];
      if (!campo) throw new Error(`No hay un campo "${etiqueta}"`);
      await act(async () => {
        (campo.props.onChangeText as (t: string) => void)(valor);
      });
    }
  }

  it('crea la cuenta de un juez con nombre, email y contraseña', async () => {
    const r = await montar(<EquipoScreen />);
    await completarAlta(r, { nombre: '  Ana   Pérez ', email: ' Ana@Mail.com ', password: 'clave1234' });
    await tocar(r, 'Juez');
    await tocar(r, 'Crear cuenta de Juez');
    expect(mockCrearCuenta).toHaveBeenCalledWith({ nombre: 'Ana Pérez', email: 'ana@mail.com', password: 'clave1234', role: 'juez' }, 'yo');
    expect(mockMostrar).toHaveBeenCalledWith('Ana Pérez ya puede entrar como juez', 'ok');
    // El formulario se cierra y vuelve el botón para sumar a otra persona.
    expect(textoDe(r)).not.toContain('Crear cuenta de Juez');
    expect(tocable(r, 'Sumar al equipo')).toBeTruthy();
    await desmontar(r);
  });

  it('no crea la cuenta con datos incompletos', async () => {
    const r = await montar(<EquipoScreen />);
    await completarAlta(r, { nombre: 'A', email: 'no-es-email', password: 'corta' });
    await tocar(r, 'Crear cuenta de Mozo');
    expect(mockCrearCuenta).not.toHaveBeenCalled();
    const texto = textoDe(r);
    expect(texto).toContain('Escribí el nombre');
    expect(texto).toContain('Revisá el email');
    expect(texto).toContain('Usá al menos 8 caracteres.');
    await desmontar(r);
  });

  it('si el email ya es de un jugador, ofrece pasarlo al equipo', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCrearCuenta.mockRejectedValueOnce(Object.assign(new Error('en uso'), { code: 'auth/email-already-in-use' }));
    mockPorEmail = [{ id: 'jx', nombre: 'Tomás H.', email: 'tomas@mail.com', role: 'jugador', estadoAprobacion: 'aprobado' }];
    const r = await montar(<EquipoScreen />);
    await completarAlta(r, { nombre: 'Tomás H.', email: 'tomas@mail.com', password: 'clave1234' });
    await tocar(r, 'Crear cuenta de Mozo');
    expect(alerta.mock.calls[0][0]).toBe('Tomás H. ya tiene cuenta de jugador');
    const botones = alerta.mock.calls[0][2] as AlertButton[];
    await act(async () => {
      botones.find((b) => b.text === 'Pasar a Mozo')?.onPress?.();
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith({ tipo: 'doc', path: 'users/jx' }, { role: 'mozo' });
    alerta.mockRestore();
    await desmontar(r);
  });

  it('si el email ya es del equipo, lo dice en el campo', async () => {
    mockCrearCuenta.mockRejectedValueOnce(Object.assign(new Error('en uso'), { code: 'auth/email-already-in-use' }));
    mockPorEmail = [{ id: 'l1', nombre: 'Lucía P.', email: 'lucia@mail.com', role: 'mozo', estadoAprobacion: 'aprobado' }];
    const r = await montar(<EquipoScreen />);
    await completarAlta(r, { nombre: 'Lucía P.', email: 'lucia@mail.com', password: 'clave1234' });
    await tocar(r, 'Crear cuenta de Mozo');
    expect(textoDe(r)).toContain('Ya está en el equipo como mozo.');
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    await desmontar(r);
  });
});
