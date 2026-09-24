// `getReactNativePersistence` existe en el build react-native de @firebase/auth
// (que Metro resuelve por la condición "react-native"), pero los tipos
// públicos de `firebase/auth` no lo declaran.
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
