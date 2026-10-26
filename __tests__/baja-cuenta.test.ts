import { BajaIncompleta, borrarMiCuenta } from '../lib/bajaCuenta';

// Baja de la propia cuenta: contraseña, datos y recién al final la cuenta de Authentication.

const mockPasos: string[] = [];
const mockReautenticar = jest.fn((_user: unknown, _cred: unknown) => Promise.resolve());
const mockBorrarUsuario = jest.fn((_user: unknown) => Promise.resolve());
const mockTransaccion = jest.fn();

jest.mock('../config/firebase', () => ({ db: {} }));

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

const USER = { uid: 'j1', email: 'ana@mail.com' } as never;

function errorCon(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPasos.length = 0;
});

describe('borrarMiCuenta', () => {
  it('verifica la contraseña, borra perfil (con la foto), ficha y reloj, y al final la cuenta', async () => {
    await borrarMiCuenta(USER, 'clave1234');
    expect(mockReautenticar).toHaveBeenCalledWith(USER, { email: 'ana@mail.com', password: 'clave1234' });
    expect(mockTransaccion).toHaveBeenCalledWith(['users/j1', 'jugadores/j1', 'relojes/j1']);
    expect(mockPasos).toEqual(['reautenticar', 'datos', 'cuenta']);
  });

  it('con la contraseña mal no borra nada', async () => {
    mockReautenticar.mockRejectedValueOnce(errorCon('auth/invalid-credential'));
    await expect(borrarMiCuenta(USER, 'mal')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    expect(mockPasos).toEqual(['reautenticar']);
  });

  it('si solo falla la cuenta de Authentication, avisa que los datos ya no están', async () => {
    mockBorrarUsuario.mockRejectedValueOnce(errorCon('auth/network-request-failed'));
    await expect(borrarMiCuenta(USER, 'clave1234')).rejects.toBeInstanceOf(BajaIncompleta);
    expect(mockTransaccion).toHaveBeenCalledTimes(1);
  });

  it('si fallan los datos, la cuenta sigue', async () => {
    mockTransaccion.mockImplementationOnce(() => {
      throw errorCon('unavailable');
    });
    await expect(borrarMiCuenta(USER, 'clave1234')).rejects.toMatchObject({ code: 'unavailable' });
    expect(mockBorrarUsuario).not.toHaveBeenCalled();
  });
});
