import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { HOST_DEMO, PROYECTO_DEMO, PUERTOS_DEMO } from '../lib/demo';

// En modo demo las credenciales no se usan: todo va a los emuladores (ver lib/demo.ts).
const configDemo = {
  apiKey: 'demo-api-key',
  authDomain: `${PROYECTO_DEMO}.firebaseapp.com`,
  projectId: PROYECTO_DEMO,
  storageBucket: `${PROYECTO_DEMO}.appspot.com`,
  messagingSenderId: '0',
  appId: 'demo',
};

const firebaseConfig = HOST_DEMO ? configDemo : {
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
export const storage = getStorage(app);

if (HOST_DEMO) {
  // Fast refresh vuelve a correr este módulo con todo ya conectado: ese segundo intento se ignora.
  try {
    connectAuthEmulator(auth, `http://${HOST_DEMO}:${PUERTOS_DEMO.auth}`, { disableWarnings: true });
  } catch {}
  try {
    connectFirestoreEmulator(db, HOST_DEMO, PUERTOS_DEMO.firestore);
  } catch {}
  try {
    connectStorageEmulator(storage, HOST_DEMO, PUERTOS_DEMO.storage);
  } catch {}
}
export default app;
