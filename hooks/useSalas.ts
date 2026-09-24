import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface Sala {
  id: string;
  nombre: string;
  orden: number;
}

export const NOMBRE_SALA_MAX = 30;

export function normalizarSala(id: string, data: Record<string, unknown>): Sala {
  return {
    id,
    nombre: typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Sala',
    orden: typeof data.orden === 'number' && Number.isFinite(data.orden) ? data.orden : 0,
  };
}

interface UseSalasResult {
  salas: Sala[];
  cargando: boolean;
  error: unknown;
}

export function useSalas(): UseSalasResult {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'salas'),
      (snap) => {
        setSalas(
          snap.docs
            .map((d) => normalizarSala(d.id, d.data()))
            .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
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
  }, []);

  return { salas, cargando, error };
}
