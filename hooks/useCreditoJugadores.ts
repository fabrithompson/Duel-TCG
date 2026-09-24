import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface JugadorCredito {
  uid: string;
  nombre: string;
  credito: number;
}

interface UseCreditoJugadoresResult {
  jugadores: JugadorCredito[];
  porUid: ReadonlyMap<string, JugadorCredito>;
  cargando: boolean;
  error: unknown;
}

// Las reglas solo dejan al staff listar usuarios si la consulta filtra por role == 'jugador'.
export function useCreditoJugadores(activo: boolean): UseCreditoJugadoresResult {
  const [jugadores, setJugadores] = useState<JugadorCredito[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!activo) return undefined;
    setCargado(false);
    const q = query(collection(db, 'users'), where('role', '==', 'jugador'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJugadores(
          snap.docs
            .map((d) => {
              const data = d.data();
              const credito = typeof data.creditoCafeteria === 'number' && Number.isFinite(data.creditoCafeteria) ? data.creditoCafeteria : 0;
              return {
                uid: d.id,
                nombre: typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Sin nombre',
                credito: Math.max(0, credito),
              };
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        );
        setError(null);
        setCargado(true);
      },
      (e) => {
        setError(e);
        setCargado(true);
      }
    );
    return unsub;
  }, [activo]);

  const porUid = useMemo(() => new Map(jugadores.map((j) => [j.uid, j])), [jugadores]);

  return { jugadores, porUid, cargando: activo && !cargado, error };
}
