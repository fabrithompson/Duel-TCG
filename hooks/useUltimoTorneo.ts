import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type DocumentData,
  type Transaction,
  type UpdateData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { codigoError, mensajeError } from '../lib/errores';
import { normalizarTorneo, type Torneo } from '../lib/torneo';

interface UseUltimoTorneoResult {
  torneo: Torneo | null;
  loading: boolean;
  error: unknown;
  reintentar: () => void;
}

/**
 * El torneo más reciente, esté en curso o ya finalizado. Torneo lo usa para
 * mostrar la ronda activa o invitar a crear uno; Premios, para repartir
 * incluso después de cerrarlo (que es justo cuando más se necesita).
 */
export function useUltimoTorneo(): UseUltimoTorneoResult {
  const [torneo, setTorneo] = useState<Torneo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'torneos'), orderBy('creadoEn', 'desc'), limit(1));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const primero = snap.docs[0];
        setTorneo(primero ? normalizarTorneo(primero.id, primero.data()) : null);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      }
    );
    return unsub;
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { torneo, loading, error, reintentar };
}

/** Motivo de negocio para no aplicar un cambio (la ronda ya avanzó, el premio ya se entregó…): se muestra tal cual. */
export class AvisoTorneo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'AvisoTorneo';
  }
}

/** Se compara por nombre además de instanceof: al transpilar, heredar de Error puede cortar la cadena de prototipos. */
export function esAvisoTorneo(e: unknown): e is AvisoTorneo {
  return e instanceof AvisoTorneo || (e instanceof Error && e.name === 'AvisoTorneo');
}

/**
 * Lee el torneo, arma los cambios sobre la versión más nueva y los escribe en
 * una transacción. Evita pisar lo que otro dispositivo escribió en el medio
 * (rondas y premios son arrays y Firestore no deja actualizar un elemento
 * suelto). `cambiar` devuelve null si no hay nada que escribir.
 */
export async function actualizarTorneo(
  torneoId: string,
  cambiar: (t: Torneo) => UpdateData<DocumentData> | null,
  /** Escrituras en otros docs que tienen que ir en la misma transacción (stock, crédito). */
  extras?: (tx: Transaction, t: Torneo) => void
): Promise<boolean> {
  const ref = doc(db, 'torneos', torneoId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new AvisoTorneo('El torneo ya no existe.');
    const t = normalizarTorneo(snap.id, snap.data());
    const cambios = cambiar(t);
    if (!cambios) return false;
    extras?.(tx, t);
    tx.update(ref, cambios);
    return true;
  });
}

/** Las transacciones no se encolan sin conexión (a diferencia de una escritura común): hay que decirlo claro. */
export function mensajeTransaccion(e: unknown, porDefecto: string): string {
  if (codigoError(e) === 'unavailable') return 'Sin conexión: no se guardó. Probá de nuevo cuando vuelva internet.';
  return mensajeError(e, porDefecto);
}
