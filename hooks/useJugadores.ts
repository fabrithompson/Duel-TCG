import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface JugadorCuenta {
  uid: string;
  nombre: string;
}

interface UseJugadoresResult {
  jugadores: JugadorCuenta[];
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

/**
 * Cuentas con rol jugador, para anotar inscriptos. La consulta lleva el
 * filtro por rol porque las reglas solo dejan al staff listar jugadores.
 */
export function useJugadores(): UseJugadoresResult {
  const [jugadores, setJugadores] = useState<JugadorCuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setCargando(true);
    const q = query(collection(db, 'users'), where('role', '==', 'jugador'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJugadores(
          snap.docs
            .map((d) => {
              const nombre = d.data().nombre;
              return { uid: d.id, nombre: typeof nombre === 'string' && nombre.trim() ? nombre.trim() : 'Sin nombre' };
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        );
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { jugadores, cargando, error, reintentar };
}
