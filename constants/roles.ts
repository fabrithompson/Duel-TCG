// Roles y permisos — ver DESIGN.md §2 del handoff de diseño.

export type SelectableRole = 'mozo' | 'juez' | 'jugador';
export type Role = SelectableRole | 'admin';

export interface RoleInfo {
  readonly id: SelectableRole;
  readonly nombre: string;
  readonly descripcion: string;
}

export const ROLES: readonly RoleInfo[] = [
  { id: 'mozo', nombre: 'Mozo', descripcion: 'Pedidos, cobro y stock de cafetería' },
  { id: 'juez', nombre: 'Juez', descripcion: 'Torneos, resultados y stock TCG' },
  { id: 'jugador', nombre: 'Jugador', descripcion: 'Mis duelos, historial y ranking' },
];

export const ROLE_LABEL: Record<Role, string> = {
  mozo: 'Mozo',
  juez: 'Juez',
  jugador: 'Jugador',
  admin: 'Admin',
};

/** Mozo y juez quedan pendientes de aprobación del admin; el jugador entra al instante. */
export function requiereAprobacion(role: Role): boolean {
  return role === 'mozo' || role === 'juez';
}
