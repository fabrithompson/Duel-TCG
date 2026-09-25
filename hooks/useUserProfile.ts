import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { Role } from '../constants/roles';
import type { EstadoAprobacion, UserProfile } from '../lib/users';

const ROLES_VALIDOS: readonly Role[] = ['admin', 'mozo', 'juez', 'jugador'];
const ESTADOS_VALIDOS: readonly EstadoAprobacion[] = ['pendiente', 'aprobado', 'rechazado'];

/** Estado del documento de perfil, más allá del perfil normalizado. */
export type EstadoDocPerfil =
  /** Existe con un rol válido. */
  | 'ok'
  /** El servidor confirmó que no existe (alta que quedó a medias). */
  | 'no_existe'
  /** Sin conexión: la caché vacía no alcanza para decir que no existe. */
  | 'sin_confirmar'
  /** Cuenta del prototipo (role 'user' o sin rol): hay que pasarla a jugador. */
  | 'legado';

export interface UseUserProfileResult {
  user: User | null;
  profile: UserProfile | null;
  estadoDoc: EstadoDocPerfil | null;
  /** Nombre que traía una cuenta heredada (campo `name` del prototipo), para migrarla. */
  nombreLegado: string | null;
  loading: boolean;
  error: unknown;
  reintentar: () => void;
}

/** Rol desconocido = sin perfil y estado desconocido = pendiente: ante la duda, no se entra. */
export function normalizarPerfil(uid: string, data: Record<string, unknown> | undefined): UserProfile | null {
  if (!data) return null;
  const role = ROLES_VALIDOS.find((r) => r === data.role);
  if (!role) return null;
  const estadoAprobacion = ESTADOS_VALIDOS.find((e) => e === data.estadoAprobacion) ?? 'pendiente';
  const email = typeof data.email === 'string' ? data.email : '';
  const nombre = typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : email.split('@')[0] || 'Sin nombre';
  return {
    uid,
    nombre,
    email,
    role,
    estadoAprobacion,
    codigoInvitacion: typeof data.codigoInvitacion === 'string' ? data.codigoInvitacion : undefined,
    emailVerificado: data.emailVerificado === true,
    creadoEn: data.creadoEn,
  };
}

interface EstadoPerfil {
  uid: string | null;
  profile: UserProfile | null;
  estadoDoc: EstadoDocPerfil | null;
  nombreLegado: string | null;
  error: unknown;
}

const SIN_PERFIL: EstadoPerfil = { uid: null, profile: null, estadoDoc: null, nombreLegado: null, error: null };

function nombreDeLegado(data: Record<string, unknown>): string | null {
  const candidatos = [data.nombre, data.name, typeof data.email === 'string' ? data.email.split('@')[0] : null];
  const nombre = candidatos.find((c): c is string => typeof c === 'string' && c.trim().length >= 2);
  return nombre ? nombre.trim().slice(0, 60) : null;
}

/** Escucha la sesión de Firebase Auth y el perfil (rol, aprobación) en Firestore. */
export function useUserProfile(): UseUserProfileResult {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [estado, setEstado] = useState<EstadoPerfil>(SIN_PERFIL);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      setEstado(SIN_PERFIL);
      return undefined;
    }
    let activo = true;
    // includeMetadataChanges: sin conexión llega primero un "no existe" desde la caché vacía; sin esta
    // opción, la confirmación posterior del servidor (solo cambia fromCache) nunca se notificaría.
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!activo) return;
        if (snap.exists()) {
          const data = snap.data();
          const profile = normalizarPerfil(uid, data);
          setEstado({
            uid,
            profile,
            estadoDoc: profile ? 'ok' : 'legado',
            nombreLegado: profile ? null : nombreDeLegado(data),
            error: null,
          });
          return;
        }
        setEstado({ uid, profile: null, estadoDoc: snap.metadata.fromCache ? 'sin_confirmar' : 'no_existe', nombreLegado: null, error: null });
      },
      (error) => {
        if (!activo) return;
        setEstado((prev) => ({ ...(prev.uid === uid ? prev : { ...SIN_PERFIL, uid }), uid, error }));
      }
    );
    return () => {
      activo = false;
      unsub();
    };
  }, [uid, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  // Derivado del uid: un flag aparte deja un render con usuario nuevo y perfil null que el guard leería como "perfil borrado".
  const perfilDeEsteUsuario = estado.uid === uid;
  return {
    user,
    profile: perfilDeEsteUsuario ? estado.profile : null,
    estadoDoc: perfilDeEsteUsuario ? estado.estadoDoc : null,
    nombreLegado: perfilDeEsteUsuario ? estado.nombreLegado : null,
    loading: authLoading || (uid !== null && (!perfilDeEsteUsuario || (estado.estadoDoc === null && !estado.error))),
    error: perfilDeEsteUsuario ? estado.error : null,
    reintentar,
  };
}
