import type { Role } from '../constants/roles';

// Modo demo (`pnpm demo`): la app habla con los emuladores de Firebase de la PC de desarrollo,
// cargados con datos de prueba. Nunca toca el proyecto real del .env, y un build de
// producción (__DEV__ en false) no entra en este modo aunque la variable esté definida.

const enDesarrollo = typeof __DEV__ === 'undefined' || __DEV__;

/** IP de la PC con los emuladores; null = la app normal, contra el proyecto de Firebase del .env. */
export const HOST_DEMO: string | null = (enDesarrollo && process.env.EXPO_PUBLIC_DEMO_HOST?.trim()) || null;

/** Los proyectos "demo-" no existen en Google: el emulador no puede tocar nada real. */
export const PROYECTO_DEMO = 'demo-duel';

// Distintos de los de firebase.json: el demo puede quedar abierto mientras corren los tests de reglas.
export const PUERTOS_DEMO = { auth: 9099, firestore: 8180, storage: 9299 } as const;

export const CLAVE_DEMO = 'duel1234';

export interface CuentaDemo {
  uid: string;
  role: Role;
  nombre: string;
  email: string;
}

// UID fijos: la sesión guardada en el teléfono sigue sirviendo después de volver a cargar los datos.
export const CUENTAS_DEMO: readonly CuentaDemo[] = [
  { uid: 'demo-admin', role: 'admin', nombre: 'Marina Ortiz', email: 'admin@duel.test' },
  { uid: 'demo-juez', role: 'juez', nombre: 'Nicolás Paz', email: 'juez@duel.test' },
  { uid: 'demo-mozo', role: 'mozo', nombre: 'Camila Ríos', email: 'mozo@duel.test' },
  { uid: 'demo-jugador', role: 'jugador', nombre: 'Tomás Herrera', email: 'jugador@duel.test' },
];
