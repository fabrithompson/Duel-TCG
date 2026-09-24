import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { normalizarTorneo, type Torneo } from '../lib/torneo';
import { esFaltaDeIndice } from '../lib/errores';
import {
  historialDeJugador,
  type FilaHistorial,
  type ResumenHistorial,
} from '../lib/temporada';

interface UseHistorialResult {
  filas: FilaHistorial[];
  resumen: ResumenHistorial;
  cargando: boolean;
  error: unknown;
  /** La consulta necesita el índice compuesto jugadoresUids + creadoEn desc. */
  faltaIndice: boolean;
  reintentar: () => void;
}

/** Todos los torneos en los que me anotaron, del más nuevo al más viejo. */
export function useHistorial(uid: string | null): UseHistorialResult {
  const [torneos, setTorneos] = useState<Torneo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!uid) {
      setTorneos([]);
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    setError(null);
    const q = query(collection(db, 'torneos'), where('jugadoresUids', 'array-contains', uid), orderBy('creadoEn', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        setTorneos(snap.docs.map((d) => normalizarTorneo(d.id, d.data())));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
  }, [uid, intento]);

  const { filas, resumen } = useMemo(() => historialDeJugador(torneos, uid ?? ''), [torneos, uid]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { filas, resumen, cargando, error, faltaIndice: esFaltaDeIndice(error), reintentar };
}
