import type { Role } from '../../constants/roles';

export type Sector = Role | 'sin-sesion';

export interface Pantalla {
  readonly id: string;
  readonly nombre: string;
  readonly ruta: string;
}

export interface Dispositivo {
  readonly id: string;
  readonly nombre: string;
  readonly ancho: number;
  readonly alto: number;
}

export const NOMBRE_SECTOR: Record<Sector, string> = {
  'sin-sesion': 'Sin sesión',
  admin: 'Admin',
  juez: 'Juez',
  mozo: 'Mozo',
  jugador: 'Jugador',
};

const MESA_CON_PEDIDO = 'qa-mesa-05';

const p = (id: string, nombre: string, ruta: string): Pantalla => ({ id, nombre, ruta });

export const PANTALLAS: Record<Sector, readonly Pantalla[]> = {
  'sin-sesion': [p('inicio', 'Inicio', '/'), p('login', 'Iniciar sesión', '/login'), p('registro', 'Crear cuenta', '/register')],
  admin: [
    p('hoy', 'Hoy', '/hoy'),
    p('salon', 'Salón', '/salon'),
    p('pedido', 'Pedido de mesa', `/salon/pedido?mesaId=${MESA_CON_PEDIDO}`),
    p('caja', 'Caja', '/caja'),
    p('torneo', 'Torneo', '/torneo'),
    p('torneo-nuevo', 'Nuevo torneo', '/torneo/nuevo'),
    p('premios', 'Premios', '/premios'),
    p('tv', 'Modo TV', '/tv'),
    p('stock', 'Stock', '/stock'),
    p('ajustes', 'Ajustes', '/ajustes'),
    p('equipo', 'Equipo', '/ajustes/equipo'),
    p('cuenta', 'Mi cuenta', '/cuenta'),
  ],
  juez: [
    p('hoy', 'Hoy', '/hoy'),
    p('torneo', 'Torneo', '/torneo'),
    p('torneo-nuevo', 'Nuevo torneo', '/torneo/nuevo'),
    p('premios', 'Premios', '/premios'),
    p('tv', 'Modo TV', '/tv'),
    p('stock', 'Stock TCG', '/stock'),
    p('cuenta', 'Mi cuenta', '/cuenta'),
  ],
  mozo: [
    p('hoy', 'Hoy', '/hoy'),
    p('salon', 'Salón', '/salon'),
    p('pedido', 'Pedido de mesa', `/salon/pedido?mesaId=${MESA_CON_PEDIDO}`),
    p('stock', 'Stock', '/stock'),
    p('cuenta', 'Mi cuenta', '/cuenta'),
  ],
  jugador: [
    p('duelo', 'Mi duelo', '/duelo'),
    p('historial', 'Historial', '/historial'),
    p('tabla', 'Tabla', '/tabla'),
    p('cuenta', 'Mi cuenta', '/cuenta'),
  ],
};

export const DISPOSITIVOS: readonly Dispositivo[] = [
  { id: 'se1', nombre: 'iPhone SE 1.ª gen.', ancho: 320, alto: 568 },
  { id: 'android-chico', nombre: 'Android chico', ancho: 360, alto: 640 },
  { id: 'se3', nombre: 'iPhone SE 3.ª gen.', ancho: 375, alto: 667 },
  { id: 'iphone', nombre: 'iPhone 15', ancho: 393, alto: 852 },
  { id: 'pixel', nombre: 'Pixel 8', ancho: 412, alto: 915 },
  { id: 'promax', nombre: 'iPhone 15 Pro Max', ancho: 430, alto: 932 },
  { id: 'tablet', nombre: 'iPad', ancho: 768, alto: 1024 },
  { id: 'horizontal', nombre: 'iPhone 15 acostado', ancho: 852, alto: 393 },
];

/** El de las pruebas de velocidad, modo noche y botones. */
export const PRINCIPAL = 'iphone';

/** Con `--rapido`: el más chico, el común y la tablet. */
export const RAPIDOS = ['se1', 'iphone', 'tablet'];
