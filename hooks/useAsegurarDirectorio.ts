import { useEffect, useRef } from 'react';
import { doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { altaDirectorio } from '../lib/jugadores';
import type { UserProfile } from '../lib/users';

/**
 * Los jugadores registrados antes de que existiera `jugadores/{uid}` no están
 * en el directorio: sin esto el staff no los encuentra para anotarlos ni para
 * aplicarles crédito. Se repara una vez por sesión, confirmando con el servidor.
 */
export function useAsegurarDirectorio(profile: UserProfile | null): void {
  const revisado = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== 'jugador' || profile.estadoAprobacion !== 'aprobado') return;
    if (revisado.current === profile.uid) return;
    revisado.current = profile.uid;
    const ref = doc(db, 'jugadores', profile.uid);
    getDocFromServer(ref)
      .then((snap) => (snap.exists() ? undefined : setDoc(ref, { ...altaDirectorio(profile.uid, profile.nombre), creadoEn: serverTimestamp() })))
      .catch(() => {
        // Sin conexión: se vuelve a intentar la próxima vez que cambie el perfil o se abra la app.
        revisado.current = null;
      });
  }, [profile]);
}
