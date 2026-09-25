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

interface Estado {
  clave: string;
  reportes: Reporte[];
  error: unknown;
}

/** Reportes que los jugadores cargaron desde el celular para una ronda (`torneos/{id}/reportes`). */
export function useReportes(torneoId: string | null, ronda: number | null): UseReportesResult {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [intento, setIntento] = useState(0);
  const clave = torneoId && ronda ? `${torneoId}_${ronda}` : '';

  useEffect(() => {
    if (!torneoId || !ronda) return undefined;
    const claveConsulta = `${torneoId}_${ronda}`;
    const q = query(collection(db, 'torneos', torneoId, 'reportes'), where('ronda', '==', ronda));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista: Reporte[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.ronda !== ronda || typeof data.mesa !== 'number' || typeof data.uid !== 'string' || !esResultado(data.resultado)) return;
          lista.push({ id: d.id, ronda, mesa: data.mesa, uid: data.uid, resultado: data.resultado, creadoEn: data.creadoEn });
        });
        setEstado({ clave: claveConsulta, reportes: lista, error: null });
      },
      (e) => setEstado({ clave: claveConsulta, reportes: [], error: e })
    );
    return unsub;
  }, [torneoId, ronda, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  // Se decide en el render: en el primer commit con la ronda nueva, la lista vieja ya no se ve.
  const vigente = estado !== null && estado.clave === clave;
  return {
    reportes: vigente ? estado.reportes : [],
    cargando: clave !== '' && !vigente,
    error: vigente ? estado.error : null,
    reintentar,
  };
}
