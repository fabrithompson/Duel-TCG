import { useEffect, useState } from 'react';
import { Timestamp, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ahoraServidor, estimarDesfase, fijarDesfase } from '../lib/reloj';

// Con más demora que esto la medición es muy imprecisa (el punto medio puede errar varios segundos).
const VIAJE_MAXIMO_MS = 4000;

/** Hora del servidor que se actualiza sola cada `cadaMs` mientras `activo` sea true. */
export function useAhoraServidor(activo = true, cadaMs = 1000): number {
  const [ahora, setAhora] = useState(ahoraServidor);
  useEffect(() => {
    if (!activo) return undefined;
    setAhora(ahoraServidor());
    const id = setInterval(() => setAhora(ahoraServidor()), cadaMs);
    return () => clearInterval(id);
  }, [activo, cadaMs]);
  return ahora;
}

let sincronizadoPara: string | null = null;

/**
 * Mide una vez por sesión cuánto difiere la hora del teléfono de la del servidor:
 * escribe un serverTimestamp en relojes/{uid} y lo compara con el reloj local.
 */
export function useSincronizarReloj(uid: string | null): void {
  useEffect(() => {
    if (!uid || sincronizadoPara === uid) return;
    sincronizadoPara = uid;
    const ref = doc(db, 'relojes', uid);
    const antes = Date.now();
    setDoc(ref, { t: serverTimestamp() })
      .then(async () => {
        const despues = Date.now();
        // Sin señal la escritura espera en la cola y confirma mucho después: esa medición no sirve.
        if (despues - antes > VIAJE_MAXIMO_MS) {
          sincronizadoPara = null;
          return;
        }
        const t = (await getDocFromServer(ref)).get('t');
        if (t instanceof Timestamp) fijarDesfase(estimarDesfase(t.toMillis(), antes, despues));
      })
      .catch(() => {
        sincronizadoPara = null;
      });
  }, [uid]);
}
