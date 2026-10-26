import type { Role } from '../constants/roles';
import { esImagenEnLinea, TOPE_FOTO } from './imagenEnLinea';

// Colección `users/{uid}`.
// Alta: el jugador se registra solo (aprobado); las cuentas de mozo y juez las
// crea el admin desde Equipo (aprobadas, con `creadoPor`), y la de admin se crea
// desde la consola de Firebase. Rol, aprobación y crédito solo los cambia el
// staff autorizado (ver firestore.rules).

export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado';

export interface UserProfile {
  uid: string;
  nombre: string;
  email: string;
  role: Role;
  estadoAprobacion: EstadoAprobacion;
  /** Admin que creó la cuenta (mozo y juez). */
  creadoPor?: string;
  /** Confirmó su email (lo marca su app al iniciar sesión, validado por las reglas con el token). */
  emailVerificado?: boolean;
  /** Foto de perfil (JPEG chica como data URL, o URL de Storage de versiones anteriores); null = silueta. */
  fotoUrl?: string | null;
  creadoEn?: unknown;
}

// Tiene que coincidir con firestore.rules (fotoValida).
const URL_FOTO = /^https:\/\/firebasestorage\.googleapis\.com\//;

export function esUrlFoto(valor: unknown): valor is string {
  return esImagenEnLinea(valor, TOPE_FOTO) || (typeof valor === 'string' && valor.length <= 1024 && URL_FOTO.test(valor));
}
