import { useCallback, useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { esResultado, idReporte, normalizarTorneo, type Resultado, type Torneo } from '../lib/torneo';
import { resultadoParaJugador } from '../lib/temporada';

interface UseMiDueloResult {
  /** Mi torneo más reciente (en curso o ya cerrado); null si nunca me anotaron en uno. */
  torneo: Torneo | null;
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

/** Último torneo en el que estoy inscripto (índice compuesto jugadoresUids + creadoEn desc). */
export function useMiDuelo(uid: string | null): UseMiDueloResult {
  const [torneo, setTorneo] = useState<Torneo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!uid) {
      setTorneo(null);
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    setError(null);
    const q = query(
      collection(db, 'torneos'),
      where('jugadoresUids', 'array-contains', uid),
      orderBy('creadoEn', 'desc'),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const primero = snap.docs[0];
        setTorneo(primero ? normalizarTorneo(primero.id, primero.data()) : null);
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
  }, [uid, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { torneo, cargando, error, reintentar };
}

interface EstadoReportes {
  /** Reportes normalizados a la perspectiva del jugador1 (como se guardan). */
  mio: Resultado | null;
  rival: Resultado | null;
  error: unknown;
}

interface ReportesDeMiPartida extends EstadoReportes {
  reintentar: () => void;
}

interface ParamsReportes {
  /** null = no escuchar (reporte de jugadores deshabilitado o sin partida). */
  torneoId: string | null;
  ronda: number;
  mesa: number;
  miUid: string;
  /** null = bye. */
  rivalUid: string | null;
}

const SIN_REPORTES: EstadoReportes = { mio: null, rival: null, error: null };

/** Mi reporte y el de mi rival para la partida de la ronda actual. */
export function useReportesPartida({ torneoId, ronda, mesa, miUid, rivalUid }: ParamsReportes): ReportesDeMiPartida {
  const [estado, setEstado] = useState<EstadoReportes>(SIN_REPORTES);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setEstado(SIN_REPORTES);
    if (!torneoId) return undefined;

    // Un error de onSnapshot corta ese listener: queda visible hasta reintentar, aunque el otro siga vivo.
    const escuchar = (uid: string, campo: 'mio' | 'rival') =>
      onSnapshot(
        doc(db, 'torneos', torneoId, 'reportes', idReporte(ronda, mesa, uid)),
        (snap) => {
          const valor: unknown = snap.exists() ? snap.data().resultado : null;
          setEstado((prev) => ({ ...prev, [campo]: esResultado(valor) ? valor : null }));
        },
        (e) => setEstado((prev) => ({ ...prev, error: e }))
      );

    const desuscribir = [escuchar(miUid, 'mio')];
    if (rivalUid) desuscribir.push(escuchar(rivalUid, 'rival'));
    return () => desuscribir.forEach((fn) => fn());
  }, [torneoId, ronda, mesa, miUid, rivalUid, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
}

interface ParamsReporte {
  torneoId: string;
  ronda: number;
  mesa: number;
  uid: string;
  /** Marcador visto desde quien reporta (mis games - los del rival). */
  resultadoMio: Resultado;
  soyJugador1: boolean;
}

/** Guarda (o corrige) mi reporte; se normaliza acá para que ningún llamador se olvide de invertirlo. */
export function reportarResultado({ torneoId, ronda, mesa, uid, resultadoMio, soyJugador1 }: ParamsReporte): Promise<void> {
  return setDoc(doc(db, 'torneos', torneoId, 'reportes', idReporte(ronda, mesa, uid)), {
    ronda,
    mesa,
    uid,
    resultado: resultadoParaJugador(resultadoMio, soyJugador1),
    creadoEn: serverTimestamp(),
  });
}
