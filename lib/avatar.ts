import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebase';
import { codigoError, mensajeError } from './errores';
import { leerComoBlob } from './logo';

export { esUrlFoto } from './users';

// Foto de perfil: `avatares/{uid}/…` en Storage y la URL en `users/{uid}.fotoUrl`
// (y en `jugadores/{uid}.fotoUrl` si la persona está en el directorio). Sin foto se ve la silueta.

/** Lado de la foto guardada: alcanza para el avatar más grande y pesa decenas de KB. */
export const FOTO_LADO = 400;

const MENSAJES: Record<string, string> = {
  'logo/no-se-pudo-leer': 'No se pudo leer la imagen elegida. Probá con otra.',
  'storage/unauthorized': 'No se pudo guardar la foto: la imagen no es válida.',
  'storage/canceled': 'Se canceló la subida de la foto.',
  'storage/retry-limit-exceeded': 'La conexión está muy lenta para subir la foto. Probá de nuevo.',
  'storage/unauthenticated': 'Tu sesión venció. Volvé a iniciar sesión.',
};

export function mensajeErrorFoto(error: unknown): string {
  const codigo = codigoError(error);
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
  return mensajeError(error, 'No se pudo cambiar la foto. Probá de nuevo.');
}

/** Achica y recomprime la foto elegida antes de subirla. */
async function prepararFoto(uri: string): Promise<string> {
  const imagen = await ImageManipulator.manipulate(uri).resize({ width: FOTO_LADO }).renderAsync();
  const resultado = await imagen.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return resultado.uri;
}

export async function subirFoto(uid: string, uri: string): Promise<string> {
  const blob = await leerComoBlob(await prepararFoto(uri));
  const destino = ref(storage, `avatares/${uid}/foto-${Date.now()}.jpg`);
  await uploadBytes(destino, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(destino);
}

// Limpieza de mejor esfuerzo: la foto nueva ya quedó guardada aunque la vieja no se pueda borrar.
export async function borrarFoto(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    return;
  }
}
