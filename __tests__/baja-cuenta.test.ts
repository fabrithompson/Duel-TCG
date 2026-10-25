import { BajaIncompleta, borrarMiCuenta } from '../lib/bajaCuenta';

// Baja de la propia cuenta: contraseña, fotos, datos y recién al final la cuenta de Authentication.

const mockPasos: string[] = [];
const mockReautenticar = jest.fn((_user: unknown, _cred: unknown) => Promise.resolve());
const mockBorrarUsuario = jest.fn((_user: unknown) => Promise.resolve());
const mockBorrarArchivo = jest.fn((_ref: string) => Promise.resolve());
const mockListar = jest.fn((_ref: string) => Promise.resolve({ items: ['avatares/j1/foto-1.jpg', 'avatares/j1/foto-2.jpg'] }));
const mockTransaccion = jest.fn();

jest.mock('../config/firebase', () => ({ db: {}, storage: {} }));

jest.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: (email: string, password: string) => ({ email, password }) },
  reauthenticateWithCredential: (user: unknown, cred: unknown) => {
    mockPasos.push('reautenticar');
    return mockReautenticar(user, cred);
  },
  deleteUser: (user: unknown) => {
    mockPasos.push('cuenta');
    return mockBorrarUsuario(user);
  },
}));

jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...partes: string[]) => partes.join('/'),
  runTransaction: async (_db: unknown, fn: (tx: { delete: (ruta: string) => void }) => Promise<void>) => {
    const borrados: string[] = [];
    await fn({ delete: (ruta) => borrados.push(ruta) });
    mockPasos.push('datos');
    mockTransaccion(borrados);
  },
}));

jest.mock('firebase/storage', () => ({
  ref: (_storage: unknown, ruta: string) => ruta,
  listAll: (r: string) => mockListar(r),
  deleteObject: (r: string) => {
    mockPasos.push(`foto ${r}`);
    return mockBorrarArchivo(r);
  },
}));

const USER = { uid: 'j1', email: 'ana@mail.com' } as never;
const FOTO = 'https://firebasestorage.googleapis.com/v0/b/duel/o/avatares%2Fj1%2Ffoto-2.jpg';

function errorCon(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPasos.length = 0;
});

describe('borrarMiCuenta', () => {
  it('verifica la contraseña, borra fotos y datos, y al final la cuenta', async () => {
    await borrarMiCuenta(USER, 'clave1234', FOTO);
    expect(mockReautenticar).toHaveBeenCalledWith(USER, { email: 'ana@mail.com', password: 'clave1234' });
    expect(mockListar).toHaveBeenCalledWith('avatares/j1');
    expect(mockTransaccion).toHaveBeenCalledWith(['users/j1', 'jugadores/j1', 'relojes/j1']);
    expect(mockPasos[0]).toBe('reautenticar');
    expect(mockPasos.slice(1, 4).sort()).toEqual([`foto ${FOTO}`, 'foto avatares/j1/foto-1.jpg', 'foto avatares/j1/foto-2.jpg'].sort());
    expect(mockPasos.slice(4)).toEqual(['datos', 'cuenta']);
  });

  it('con la contraseña mal no borra nada', async () => {
    mockReautenticar.mockRejectedValueOnce(errorCon('auth/invalid-credential'));
    await expect(borrarMiCuenta(USER, 'mal', FOTO)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(mockPasos).toEqual(['reautenticar']);
  });

  it('si la foto actual no se puede borrar, corta antes de tocar los datos', async () => {
    // La actual se borra primero, sola.
    mockBorrarArchivo.mockRejectedValueOnce(errorCon('storage/retry-limit-exceeded'));
    await expect(borrarMiCuenta(USER, 'clave1234', FOTO)).rejects.toMatchObject({ code: 'storage/retry-limit-exceeded' });
    expect(mockTransaccion).not.toHaveBeenCalled();
    expect(mockBorrarUsuario).not.toHaveBeenCalled();
  });

  it('una foto que ya no existe o una carpeta que no se puede listar no frenan la baja', async () => {
    mockBorrarArchivo.mockRejectedValueOnce(errorCon('storage/object-not-found'));
    mockListar.mockRejectedValueOnce(errorCon('storage/unauthorized'));
    await borrarMiCuenta(USER, 'clave1234', FOTO);
    expect(mockPasos.slice(-2)).toEqual(['datos', 'cuenta']);
  });

  it('sin foto no busca la actual, pero igual limpia la carpeta', async () => {
    await borrarMiCuenta(USER, 'clave1234', null);
    expect(mockBorrarArchivo).not.toHaveBeenCalledWith(FOTO);
    expect(mockBorrarArchivo).toHaveBeenCalledTimes(2);
  });

  it('si solo falla la cuenta de Authentication, avisa que los datos ya no están', async () => {
    mockBorrarUsuario.mockRejectedValueOnce(errorCon('auth/network-request-failed'));
    await expect(borrarMiCuenta(USER, 'clave1234', FOTO)).rejects.toBeInstanceOf(BajaIncompleta);
    expect(mockTransaccion).toHaveBeenCalledTimes(1);
  });

  it('si fallan los datos, la cuenta sigue', async () => {
    mockTransaccion.mockImplementationOnce(() => {
      throw errorCon('unavailable');
    });
    await expect(borrarMiCuenta(USER, 'clave1234', FOTO)).rejects.toMatchObject({ code: 'unavailable' });
    expect(mockBorrarUsuario).not.toHaveBeenCalled();
  });
});
