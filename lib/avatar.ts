import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { codigoError, mensajeError } from './errores';
import { PREFIJO_JPEG, TOPE_FOTO } from './imagenEnLinea';

export { esUrlFoto } from './users';

// Foto de perfil: una JPEG chica dentro de `users/{uid}.fotoUrl` (y de `jugadores/{uid}.fotoUrl`
// si la persona está en el directorio), sin Storage. Sin foto se ve la silueta.

/** Lado de la foto guardada: alcanza para el avatar más grande (68 px) en pantallas de 3x. */
export const FOTO_LADO = 200;

// Si con la primera calidad se pasa del tope (una foto con mucho detalle), se prueba con menos.
const CALIDADES = [0.75, 0.55, 0.35];

type CodigoImagen = 'imagen/muy-pesada' | 'imagen/no-se-pudo-leer';

class ErrorImagen extends Error {
  readonly code: CodigoImagen;

  constructor(code: CodigoImagen) {
    super(code);
    this.name = 'ErrorImagen';
    this.code = code;
  }
}

/** Achica la imagen a `lado` px de ancho y la devuelve como data URL JPEG de hasta `tope` caracteres. */
export async function comprimirImagen(uri: string, lado: number, tope: number): Promise<string> {
  let imagen;
  try {
    imagen = await ImageManipulator.manipulate(uri).resize({ width: lado }).renderAsync();
  } catch {
    throw new ErrorImagen('imagen/no-se-pudo-leer');
  }
  for (const compress of CALIDADES) {
    const { base64 } = await imagen.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
    if (!base64) throw new ErrorImagen('imagen/no-se-pudo-leer');
    const dataUrl = PREFIJO_JPEG + base64;
    if (dataUrl.length <= tope) return dataUrl;
  }
  throw new ErrorImagen('imagen/muy-pesada');
}

export function prepararFoto(uri: string): Promise<string> {
  return comprimirImagen(uri, FOTO_LADO, TOPE_FOTO);
}

const MENSAJES: Record<string, string> = {
  'imagen/no-se-pudo-leer': 'No se pudo leer la imagen elegida. Probá con otra.',
  'imagen/muy-pesada': 'La imagen tiene demasiado detalle. Probá con otra.',
  'permission-denied': 'No se pudo guardar la foto: la imagen no es válida.',
};

export function mensajeErrorFoto(error: unknown): string {
  const codigo = codigoError(error)?.replace(/^firestore\//, '');
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
  return mensajeError(error, 'No se pudo cambiar la foto. Probá de nuevo.');
}
