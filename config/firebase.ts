import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, getReactNativePersistence, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const faltantes = Object.entries(firebaseConfig)
  .filter(([, valor]) => !valor)
  .map(([clave]) => clave);

if (faltantes.length > 0) {
  throw new Error(`Faltan credenciales de Firebase en .env: ${faltantes.join(', ')}`);
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function crearAuth(): Auth {
  if (Platform.OS === 'web') return getAuth(app);
  try {
    // Persiste la sesión entre aperturas de la app (getAuth solo usa memoria en RN).
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh: auth ya estaba inicializado en esta instancia de la app.
    return getAuth(app);
  }
}

export const auth = crearAuth();
export const db = getFirestore(app);

/**
 * Sesión de Auth aparte, solo en memoria: crear una cuenta deja adentro a la cuenta nueva, y así
 * el admin da de alta a alguien del equipo sin que se le cierre la suya. Hay que cerrarla al terminar.
 */
export function abrirAuthAparte(): { auth: Auth; cerrar: () => Promise<void> } {
  const aparte = initializeApp(firebaseConfig, `aparte-${Date.now()}`);
  const authAparte = initializeAuth(aparte, { persistence: inMemoryPersistence });
  return {
    auth: authAparte,
    cerrar: () =>
      signOut(authAparte)
        .catch(() => undefined)
        .then(() => deleteApp(aparte)),
  };
}

export default app;
