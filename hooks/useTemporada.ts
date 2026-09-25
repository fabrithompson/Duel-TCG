import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, limitToLast, onSnapshot, orderBy, query, where } from 'firebase/firestore';
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
  /** Sin inicio de temporada solo se miran los últimos torneos: la tabla puede no incluir los más viejos. */
  recortada: boolean;
  reintentar: () => void;
}

// Sin inicio de temporada no se baja toda la historia del local en cada apertura de la Tabla.
export const MAX_TORNEOS_SIN_INICIO = 200;

/** Tabla de la temporada configurada en Ajustes, armada con las posiciones de los torneos cerrados. */
export function useTemporada(): UseTemporadaResult {
  const { config, cargando: cargandoConfig } = useConfig();
  const inicio = config.temporada.inicio;
  const inicioMs = config.temporada.inicioMs;
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
      : query(base, where('estado', '==', 'finalizado'), orderBy('fecha', 'asc'), limitToLast(MAX_TORNEOS_SIN_INICIO));
    return onSnapshot(
      q,
      (snap) => {
        setTorneos(
          snap.docs.map((d) => {
            const { fecha, posiciones, formatoId, creadoEn } = normalizarTorneo(d.id, d.data());
            return { fecha, posiciones, formatoId, creadoEn };
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

  const filas = useMemo(() => calcularTablaTemporada(torneos, inicio, inicioMs), [torneos, inicio, inicioMs]);
  const fechas = useMemo(() => fechasDeTemporada(torneos, inicio, inicioMs), [torneos, inicio, inicioMs]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const recortada = !inicio && torneos.length >= MAX_TORNEOS_SIN_INICIO;
  return { filas, fechas, cargando: cargando || cargandoConfig, error, faltaIndice: esFaltaDeIndice(error), recortada, reintentar };
}
