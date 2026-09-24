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
  /** Crédito de cafetería ganado en torneos, pendiente de usar en un pedido. */
  creditoCafeteria?: number;
  /** Código con el que se registró (mozo/juez); las reglas lo validan al crear. */
  codigoInvitacion?: string;
  creadoEn?: unknown;
}
