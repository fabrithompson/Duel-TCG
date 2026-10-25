// Reemplaza a config/firebase.ts solo en el build web de `pnpm qa:ui` (lo cambia metro.config.js
// con DUEL_QA=1): la app habla con los emuladores de esta PC, nunca con el proyecto del .env.

import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { PROYECTO_QA, PUERTOS_QA } from './entorno';

const HOST = '127.0.0.1';

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: 'demo-api-key',
        authDomain: `${PROYECTO_QA}.firebaseapp.com`,
        projectId: PROYECTO_QA,
        storageBucket: `${PROYECTO_QA}.appspot.com`,
        messagingSenderId: '0',
        appId: 'demo',
      });

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

connectAuthEmulator(auth, `http://${HOST}:${PUERTOS_QA.auth}`, { disableWarnings: true });
connectFirestoreEmulator(db, HOST, PUERTOS_QA.firestore);
connectStorageEmulator(storage, HOST, PUERTOS_QA.storage);

/** Como en config/firebase.ts, pero contra el emulador de Auth. */
export function abrirAuthAparte(): { auth: Auth; cerrar: () => Promise<void> } {
  const aparte = initializeApp(app.options, `aparte-${Date.now()}`);
  const authAparte = initializeAuth(aparte, { persistence: inMemoryPersistence });
  connectAuthEmulator(authAparte, `http://${HOST}:${PUERTOS_QA.auth}`, { disableWarnings: true });
  return {
    auth: authAparte,
    cerrar: () =>
      signOut(authAparte)
        .catch(() => undefined)
        .then(() => deleteApp(aparte)),
  };
}

export default app;
