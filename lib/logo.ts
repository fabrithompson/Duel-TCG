import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebase';
import { codigoError, mensajeError } from './errores';

// Tiene que coincidir con storage.rules (logos/**: tamaño estrictamente menor a 2 MB).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

type CodigoLogo = 'logo/muy-pesado' | 'logo/vacio' | 'logo/no-se-pudo-leer';

class ErrorLogo extends Error {
  readonly code: CodigoLogo;

  constructor(code: CodigoLogo, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLogo';
    this.code = code;
  }
}

const MENSAJES: Record<string, string> = {
  'logo/muy-pesado': 'La imagen pesa más de 2 MB. Elegí una más liviana o recortala.',
  'logo/vacio': 'La imagen elegida está vacía. Probá con otra.',
  'logo/no-se-pudo-leer': 'No se pudo leer la imagen elegida. Probá con otra.',
  'storage/unauthorized': 'No tenés permiso para cambiar el logo, o la imagen no es válida.',
  'storage/canceled': 'Se canceló la subida del logo.',
  'storage/retry-limit-exceeded': 'La conexión está muy lenta para subir el logo. Probá de nuevo.',
  'storage/quota-exceeded': 'Se llenó el espacio de archivos del local. Avisale al desarrollador.',
  'storage/unauthenticated': 'Tu sesión venció. Volvé a iniciar sesión.',
};

export function mensajeErrorLogo(error: unknown): string {
  const codigo = codigoError(error);
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
  return mensajeError(error, 'No se pudo cambiar el logo. Probá de nuevo.');
}

// XHR y no fetch(): en React Native es la forma confiable de leer un file:// como Blob.
function leerComoBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status >= 400) reject(new ErrorLogo('logo/no-se-pudo-leer', `HTTP ${xhr.status}`));
      else resolve(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new ErrorLogo('logo/no-se-pudo-leer', 'Error al leer la imagen'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

export async function subirLogo(uri: string): Promise<string> {
  const blob = await leerComoBlob(uri);
  if (blob.size === 0) throw new ErrorLogo('logo/vacio', 'Imagen vacía');
  if (blob.size >= LOGO_MAX_BYTES) throw new ErrorLogo('logo/muy-pesado', `Imagen de ${blob.size} bytes`);
  const contentType = blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const destino = ref(storage, `logos/logo-${Date.now()}.jpg`);
  await uploadBytes(destino, blob, { contentType });
  return getDownloadURL(destino);
}

// Limpieza de mejor esfuerzo: si falla (URL externa, reglas), queda un archivo huérfano
// pero el logo nuevo ya quedó guardado, así que no vale la pena molestar al admin.
export async function borrarLogo(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    return;
  }
}
