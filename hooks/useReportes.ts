import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { esResultado, type Reporte } from '../lib/torneo';

interface UseReportesResult {
  reportes: Reporte[];
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

/** Reportes que los jugadores cargaron desde el celular para una ronda (`torneos/{id}/reportes`). */
export function useReportes(torneoId: string | null, ronda: number | null): UseReportesResult {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!torneoId || !ronda) {
      setReportes([]);
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    const q = query(collection(db, 'torneos', torneoId, 'reportes'), where('ronda', '==', ronda));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: Reporte[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (typeof data.mesa !== 'number' || typeof data.uid !== 'string' || !esResultado(data.resultado)) return;
          lista.push({ id: d.id, ronda, mesa: data.mesa, uid: data.uid, resultado: data.resultado, creadoEn: data.creadoEn });
        });
        setReportes(lista);
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [torneoId, ronda, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { reportes, cargando, error, reintentar };
}
