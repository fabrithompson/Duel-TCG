import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { normalizarMesa, type Mesa } from './useMesas';

interface UseMesasDueloResult {
  /** Mesas del Salón con tipo 'duelo', ordenadas por número (así se asignan a las partidas). */
  mesas: Mesa[];
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

export function useMesasDuelo(): UseMesasDueloResult {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setCargando(true);
    // Se ordena en el cliente: where + orderBy sobre otro campo pediría un índice compuesto.
    const q = query(collection(db, 'mesas'), where('tipo', '==', 'duelo'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMesas(snap.docs.map((d) => normalizarMesa(d.id, d.data())).sort((a, b) => a.numero - b.numero));
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
  return { mesas, cargando, error, reintentar };
}
