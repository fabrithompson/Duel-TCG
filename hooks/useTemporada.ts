import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useConfig } from '../contexts/ConfigContext';
import { normalizarTorneo } from '../lib/torneo';
import { esFaltaDeIndice } from '../lib/errores';
import {
  calcularTablaTemporada,
  fechasDeTemporada,
  type FilaTemporada,
  type TorneoTemporada,
} from '../lib/temporada';

interface UseTemporadaResult {
  filas: FilaTemporada[];
  /** Torneos cerrados de la temporada que dejaron posiciones (sin contar los casuales). */
  fechas: number;
  cargando: boolean;
  error: unknown;
  /** La consulta necesita el índice compuesto estado + fecha asc. */
  faltaIndice: boolean;
  reintentar: () => void;
}

/** Tabla de la temporada configurada en Ajustes, armada con las posiciones de los torneos cerrados. */
export function useTemporada(): UseTemporadaResult {
  const { config, cargando: cargandoConfig } = useConfig();
  const inicio = config.temporada.inicio;
  const [torneos, setTorneos] = useState<TorneoTemporada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // Esperar la config evita una primera consulta sin el corte de temporada.
    if (cargandoConfig) return undefined;
    setCargando(true);
    setError(null);
    const base = collection(db, 'torneos');
    // Mismo índice compuesto (estado, fecha): el rango sobre fecha no suma índices nuevos.
    const q = inicio
      ? query(base, where('estado', '==', 'finalizado'), where('fecha', '>=', inicio), orderBy('fecha', 'asc'))
      : query(base, where('estado', '==', 'finalizado'), orderBy('fecha', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        setTorneos(
          snap.docs.map((d) => {
            const { fecha, posiciones, formatoId } = normalizarTorneo(d.id, d.data());
            return { fecha, posiciones, formatoId };
          })
        );
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
  }, [inicio, cargandoConfig, intento]);

  const filas = useMemo(() => calcularTablaTemporada(torneos, inicio), [torneos, inicio]);
  const fechas = useMemo(() => fechasDeTemporada(torneos, inicio), [torneos, inicio]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { filas, fechas, cargando: cargando || cargandoConfig, error, faltaIndice: esFaltaDeIndice(error), reintentar };
}
