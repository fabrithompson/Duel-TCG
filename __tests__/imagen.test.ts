import { comprimirImagen, FOTO_LADO, mensajeErrorFoto, prepararFoto } from '../lib/avatar';
import { prepararLogo } from '../lib/logo';
import { PREFIJO_JPEG, TOPE_FOTO } from '../lib/imagenEnLinea';

// Fotos y logo se guardan en Firestore como data URL JPEG chica: se achican y, si con la primera
// calidad se pasan del tope de las reglas, se prueba con menos.

const mockResize = jest.fn();
const mockSave = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      if (uri === 'rota') throw new Error('no es una imagen');
      return {
        resize: (opciones: unknown) => {
          mockResize(opciones);
          return { renderAsync: () => Promise.resolve({ saveAsync: (o: { compress: number }) => Promise.resolve(mockSave(o)) }) };
        },
      };
    },
  },
}));

jest.mock('../lib/users', () => ({ esUrlFoto: () => true }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('comprimirImagen', () => {
  it('achica al ancho pedido y devuelve la JPEG en base64 como data URL', async () => {
    mockSave.mockReturnValue({ base64: '/9jAAAA' });
    await expect(prepararFoto('file:///foto.jpg')).resolves.toBe(`${PREFIJO_JPEG}/9jAAAA`);
    expect(mockResize).toHaveBeenCalledWith({ width: FOTO_LADO });
    expect(mockSave).toHaveBeenCalledWith({ compress: 0.75, format: 'jpeg', base64: true });
  });

  it('si se pasa del tope, baja la calidad', async () => {
    mockSave.mockImplementation(({ compress }: { compress: number }) => ({ base64: 'A'.repeat(compress > 0.5 ? TOPE_FOTO : 1000) }));
    const foto = await prepararFoto('file:///foto.jpg');
    expect(foto.length).toBeLessThanOrEqual(TOPE_FOTO);
    expect(mockSave.mock.calls.map(([o]) => o.compress)).toEqual([0.75, 0.55, 0.35]);
  });

  it('si ni con la calidad más baja entra, avisa sin guardar nada', async () => {
    mockSave.mockReturnValue({ base64: 'A'.repeat(TOPE_FOTO) });
    await expect(comprimirImagen('file:///foto.jpg', 200, TOPE_FOTO)).rejects.toMatchObject({ code: 'imagen/muy-pesada' });
  });

  it('una imagen que no se puede leer da un error claro', async () => {
    const e = await comprimirImagen('rota', 200, TOPE_FOTO).catch((x: unknown) => x);
    expect(mensajeErrorFoto(e)).toBe('No se pudo leer la imagen elegida. Probá con otra.');
  });

  it('el logo se guarda más grande que la foto', async () => {
    mockSave.mockReturnValue({ base64: '/9jAAAA' });
    await prepararLogo('file:///logo.png');
    expect(mockResize).toHaveBeenCalledWith({ width: 480 });
  });
});
