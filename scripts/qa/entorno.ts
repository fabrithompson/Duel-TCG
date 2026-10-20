import type { Role } from '../../constants/roles';

// Entorno de `pnpm qa:ui`: emuladores de Firebase en esta PC con datos de prueba.
// Nunca toca el proyecto real del .env: el proyecto "demo-" no existe en Google.

export const PROYECTO_QA = 'demo-duel-qa';

// Distintos de los de firebase.json: los tests de reglas pueden correr a la vez.
export const PUERTOS_QA = { auth: 9399, firestore: 8380, storage: 9499 } as const;

export const PUERTO_WEB_QA = 8390;

export const CLAVE_QA = 'duel1234';

export const CODIGO_QA = 'DUEL2345';

export interface CuentaQA {
  uid: string;
  role: Role;
  nombre: string;
  email: string;
}

export const CUENTAS_QA: readonly CuentaQA[] = [
  { uid: 'qa-admin', role: 'admin', nombre: 'Marina Ortiz', email: 'admin@duel.test' },
  { uid: 'qa-juez', role: 'juez', nombre: 'Nicolás Paz', email: 'juez@duel.test' },
  { uid: 'qa-mozo', role: 'mozo', nombre: 'Camila Ríos', email: 'mozo@duel.test' },
  { uid: 'qa-jugador', role: 'jugador', nombre: 'Tomás Herrera', email: 'jugador@duel.test' },
];
