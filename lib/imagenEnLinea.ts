// Fotos de perfil y logo del local: una imagen JPEG chica guardada dentro del mismo documento de
// Firestore, como data URL. El plan gratis de Firebase no incluye Storage. Los topes son en
// caracteres y tienen que coincidir con firestore.rules (imagenEnLinea).

export const PREFIJO_JPEG = 'data:image/jpeg;base64,';

/** Foto de perfil: 200 px de ancho, unas decenas de KB. */
export const TOPE_FOTO = 100_000;

/** Logo del local: 480 px de ancho. Lo baja cualquiera al abrir la app (config/publico). */
export const TOPE_LOGO = 250_000;

const BASE64 = /^[A-Za-z0-9+/]+=*$/;

export function esImagenEnLinea(valor: unknown, tope: number): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length <= tope &&
    valor.startsWith(PREFIJO_JPEG) &&
    BASE64.test(valor.slice(PREFIJO_JPEG.length))
  );
}
