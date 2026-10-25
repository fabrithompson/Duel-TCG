// Roles y permisos — ver DESIGN.md §2 del handoff de diseño.
// Desde la app solo se registran jugadores. Las cuentas de mozo y juez las crea el admin
// en Ajustes > Equipo, y la de admin se crea desde la consola de Firebase.

/** Las cuentas que el admin crea desde Equipo. */
export type RolEquipo = 'mozo' | 'juez';
export type Role = RolEquipo | 'jugador' | 'admin';

export interface RoleInfo {
  readonly id: RolEquipo;
  readonly nombre: string;
  readonly descripcion: string;
}

export const ROLES_EQUIPO: readonly RoleInfo[] = [
  { id: 'mozo', nombre: 'Mozo', descripcion: 'Pedidos, cobro y stock de cafetería' },
  { id: 'juez', nombre: 'Juez', descripcion: 'Torneos, resultados y stock TCG' },
];

export const ROLE_LABEL: Record<Role, string> = {
  mozo: 'Mozo',
  juez: 'Juez',
  jugador: 'Jugador',
  admin: 'Admin',
};
