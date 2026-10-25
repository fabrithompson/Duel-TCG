import { crearCuentaEquipo } from '../lib/altaEquipo';

// Alta de mozos y jueces: la cuenta se crea en una sesión aparte y, si el perfil no se guarda, se deshace.

const mockUsuario = { uid: 'nuevo1', email: 'ana@mail.com' };
const mockCerrar = jest.fn(() => Promise.resolve());
const mockCrearUsuario = jest.fn((_auth: unknown, _email: string, _password: string) => Promise.resolve({ user: mockUsuario }));
const mockBorrarUsuario = jest.fn((_user: unknown) => Promise.resolve());
const mockSet = jest.fn();
const mockTransaccion = jest.fn((_db: unknown, fn: (tx: { set: typeof mockSet }) => Promise<void>) => fn({ set: mockSet }));

jest.mock('../config/firebase', () => ({
  db: {},
  abrirAuthAparte: () => ({ auth: { aparte: true }, cerrar: mockCerrar }),
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (auth: unknown, email: string, password: string) => mockCrearUsuario(auth, email, password),
  deleteUser: (user: unknown) => mockBorrarUsuario(user),
  updateProfile: () => Promise.resolve(),
}));

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...partes: string[]) => partes.join('/'),
  runTransaction: (db: unknown, fn: (tx: { set: typeof mockSet }) => Promise<void>) => mockTransaccion(db, fn),
  serverTimestamp: () => 'AHORA',
}));

const ALTA = { nombre: 'Ana Pérez', email: 'ana@mail.com', password: 'clave1234', role: 'juez' as const };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('crearCuentaEquipo', () => {
  it('crea la cuenta en la sesión aparte y guarda el perfil aprobado, firmado por el admin', async () => {
    await expect(crearCuentaEquipo(ALTA, 'admin1')).resolves.toBe('nuevo1');
    expect(mockCrearUsuario).toHaveBeenCalledWith({ aparte: true }, 'ana@mail.com', 'clave1234');
    expect(mockSet).toHaveBeenCalledWith('users/nuevo1', {
      uid: 'nuevo1',
      nombre: 'Ana Pérez',
      email: 'ana@mail.com',
      role: 'juez',
      estadoAprobacion: 'aprobado',
      creadoPor: 'admin1',
      creadoEn: 'AHORA',
    });
    expect(mockBorrarUsuario).not.toHaveBeenCalled();
    expect(mockCerrar).toHaveBeenCalledTimes(1);
  });

  it('si el perfil no se guarda, borra la cuenta nueva y avisa el error', async () => {
    const error = Object.assign(new Error('sin permiso'), { code: 'permission-denied' });
    mockTransaccion.mockRejectedValueOnce(error);
    await expect(crearCuentaEquipo(ALTA, 'admin1')).rejects.toBe(error);
    expect(mockBorrarUsuario).toHaveBeenCalledWith(mockUsuario);
    expect(mockCerrar).toHaveBeenCalledTimes(1);
  });

  it('si Authentication rechaza el email, no escribe nada', async () => {
    const error = Object.assign(new Error('en uso'), { code: 'auth/email-already-in-use' });
    mockCrearUsuario.mockRejectedValueOnce(error);
    await expect(crearCuentaEquipo(ALTA, 'admin1')).rejects.toBe(error);
    expect(mockTransaccion).not.toHaveBeenCalled();
    expect(mockBorrarUsuario).not.toHaveBeenCalled();
    expect(mockCerrar).toHaveBeenCalledTimes(1);
  });
});
