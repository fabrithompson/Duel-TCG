import type { Role } from '../constants/roles';

// Colección `users/{uid}`.
// Alta: el propio usuario, solo como mozo/juez (pendiente, con código de
// invitación válido) o jugador (aprobado). La cuenta admin se crea desde la
// consola de Firebase. Rol, aprobación y crédito solo los cambia el staff
// autorizado (ver firestore.rules).

export type EstadoAprobacion = 'pendiente' | 'aprobado' | 'rechazado';

export interface UserProfile {
  uid: string;
  nombre: string;
  email: string;
  role: Role;
  estadoAprobacion: EstadoAprobacion;
  /** Código con el que se registró (mozo/juez); las reglas lo validan al crear. */
  codigoInvitacion?: string;
  /** Confirmó su email (lo marca su app al iniciar sesión, validado por las reglas con el token). */
  emailVerificado?: boolean;
  creadoEn?: unknown;
}
