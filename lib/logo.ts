import { comprimirImagen } from './avatar';
import { codigoError, mensajeError } from './errores';
import { TOPE_LOGO } from './imagenEnLinea';

// Logo del local: una JPEG chica dentro de `config/publico.logoUrl`, sin Storage.

/** Ancho del logo guardado: se ve nítido en el inicio (200 px) y en la tele. */
export const LOGO_LADO = 480;

export function prepararLogo(uri: string): Promise<string> {
  return comprimirImagen(uri, LOGO_LADO, TOPE_LOGO);
}

const MENSAJES: Record<string, string> = {
  'imagen/no-se-pudo-leer': 'No se pudo leer la imagen elegida. Probá con otra.',
  'imagen/muy-pesada': 'La imagen tiene demasiado detalle. Probá con otra.',
  'permission-denied': 'No tenés permiso para cambiar el logo, o la imagen no es válida.',
};

export function mensajeErrorLogo(error: unknown): string {
  const codigo = codigoError(error)?.replace(/^firestore\//, '');
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
  return mensajeError(error, 'No se pudo cambiar el logo. Probá de nuevo.');
}
