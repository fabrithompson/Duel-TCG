import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Timestamp, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ahoraServidor, estimarDesfase, fijarDesfase } from '../lib/reloj';

// Con más demora que esto la medición es muy imprecisa (el punto medio puede errar varios segundos).
const VIAJE_MAXIMO_MS = 4000;
// Si falla (sin señal, wifi flojo), se vuelve a intentar cada vez más espaciado.
const REINTENTO_MIN_MS = 5_000;
const REINTENTO_MAX_MS = 60_000;

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

let medidoPara: string | null = null;
let midiendo = false;

/**
 * Escribe un serverTimestamp en relojes/{uid} y lo compara con el reloj local.
 * Devuelve false si no se pudo medir bien (sin señal o con mucha demora).
 */
async function medirDesfase(uid: string): Promise<boolean> {
  const ref = doc(db, 'relojes', uid);
  const antes = Date.now();
  await setDoc(ref, { t: serverTimestamp() });
  const despues = Date.now();
  // Sin señal la escritura espera en la cola y confirma mucho después: esa medición no sirve.
  if (despues - antes > VIAJE_MAXIMO_MS) return false;
  const t = (await getDocFromServer(ref)).get('t');
  if (!(t instanceof Timestamp)) return false;
  fijarDesfase(estimarDesfase(t.toMillis(), antes, despues));
  return true;
}

/**
 * Mide cuánto difiere la hora del teléfono de la del servidor, una vez por sesión. Si la
 * medición falla, reintenta con espera creciente y también al volver la app a primer plano:
 * el juez que abre la app con mala señal no puede quedarse escribiendo el reloj con su hora.
 */
export function useSincronizarReloj(uid: string | null): void {
  const [intento, setIntento] = useState(0);
  const reintento = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uid || medidoPara === uid || midiendo) return;
    midiendo = true;
    medirDesfase(uid)
      .catch(() => false)
      .then((ok) => {
        midiendo = false;
        if (ok) {
          medidoPara = uid;
          return;
        }
        const espera = Math.min(REINTENTO_MAX_MS, REINTENTO_MIN_MS * 2 ** Math.min(intento, 4));
        if (reintento.current) clearTimeout(reintento.current);
        reintento.current = setTimeout(() => setIntento((n) => n + 1), espera);
      });
  }, [uid, intento]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && uid && medidoPara !== uid) setIntento((n) => n + 1);
    });
    return () => {
      sub.remove();
      if (reintento.current) clearTimeout(reintento.current);
    };
  }, [uid]);
}
