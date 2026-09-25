import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where, type Query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { JugadorDirectorio, normalizarBusqueda, normalizarJugadorDirectorio } from '../lib/jugadores';

const ESPERA_BUSQUEDA_MS = 250;

interface OpcionesBusqueda {
  activo: boolean;
  busqueda: string;
  /** Tope de resultados: con miles de cuentas registradas las pantallas del staff no pueden bajarlas todas. */
  limite?: number;
  /** Sin texto de búsqueda, muestra primero a quienes tienen crédito (hoja de cobro). */
  conCreditoPrimero?: boolean;
}

interface ResultadoBusqueda {
  jugadores: JugadorDirectorio[];
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
}

function useDemorado(valor: string, ms: number): string {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return demorado;
}

/** Busca en `jugadores` por prefijo del nombre normalizado, con límite. */
export function useBuscarJugadores({ activo, busqueda, limite = 20, conCreditoPrimero = false }: OpcionesBusqueda): ResultadoBusqueda {
  const prefijo = normalizarBusqueda(useDemorado(busqueda, ESPERA_BUSQUEDA_MS));
  const [estado, setEstado] = useState<{ clave: string; jugadores: JugadorDirectorio[]; error: unknown } | null>(null);
  const [intento, setIntento] = useState(0);
  const clave = activo ? `${prefijo}|${limite}|${conCreditoPrimero}|${intento}` : '';

  useEffect(() => {
    if (!activo) return undefined;
    const claveConsulta = `${prefijo}|${limite}|${conCreditoPrimero}|${intento}`;
    const ref = collection(db, 'jugadores');
    let q: Query;
    if (prefijo) {
      q = query(ref, where('nombreBusqueda', '>=', prefijo), where('nombreBusqueda', '<=', `${prefijo}\uf8ff`), orderBy('nombreBusqueda'), limit(limite));
    } else if (conCreditoPrimero) {
      q = query(ref, where('creditoCafeteria', '>', 0), orderBy('creditoCafeteria', 'desc'), limit(limite));
    } else {
      q = query(ref, orderBy('nombreBusqueda'), limit(limite));
    }
    const unsub = onSnapshot(
      q,
      // Los bloqueados por el admin no aparecen en las búsquedas del staff.
      (snap) => setEstado({ clave: claveConsulta, jugadores: snap.docs.map((d) => normalizarJugadorDirectorio(d.id, d.data())).filter((j) => j.activo), error: null }),
      (e) => setEstado({ clave: claveConsulta, jugadores: [], error: e })
    );
    return unsub;
  }, [activo, prefijo, limite, conCreditoPrimero, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const vigente = estado !== null && estado.clave === clave;
  return {
    jugadores: vigente ? estado.jugadores : [],
    cargando: activo && !vigente,
    error: vigente ? estado.error : null,
    reintentar,
  };
}

/** Entradas del directorio de unos pocos jugadores puntuales (los sentados en una mesa, el ganador de un premio). */
export function useJugadoresPorUid(uids: readonly string[]): ReadonlyMap<string, JugadorDirectorio> {
  const clave = [...new Set(uids)].sort().join('|');
  const [mapa, setMapa] = useState<Map<string, JugadorDirectorio>>(new Map());

  useEffect(() => {
    const lista = clave ? clave.split('|') : [];
    setMapa(new Map());
    const unsubs = lista.map((uid) =>
      onSnapshot(
        doc(db, 'jugadores', uid),
        (snap) =>
          setMapa((prev) => {
            const nuevo = new Map(prev);
            if (snap.exists()) nuevo.set(uid, normalizarJugadorDirectorio(uid, snap.data()));
            else nuevo.delete(uid);
            return nuevo;
          }),
        () => undefined
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [clave]);

  return mapa;
}

/** Crédito de cafetería del propio jugador (su entrada del directorio). */
export function useMiCredito(uid: string | null): { credito: number | null; error: unknown } {
  const [estado, setEstado] = useState<{ uid: string; credito: number | null; error: unknown } | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    const unsub = onSnapshot(
      doc(db, 'jugadores', uid),
      (snap) => setEstado({ uid, credito: snap.exists() ? normalizarJugadorDirectorio(uid, snap.data()).credito : 0, error: null }),
      (e) => setEstado({ uid, credito: null, error: e })
    );
    return unsub;
  }, [uid]);

  return useMemo(
    () => (estado && estado.uid === uid ? { credito: estado.credito, error: estado.error } : { credito: null, error: null }),
    [estado, uid]
  );
}
