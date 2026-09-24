import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { Role } from '../constants/roles';
import type { EstadoAprobacion, UserProfile } from '../lib/users';

const ROLES_VALIDOS: readonly Role[] = ['admin', 'mozo', 'juez', 'jugador'];
const ESTADOS_VALIDOS: readonly EstadoAprobacion[] = ['pendiente', 'aprobado', 'rechazado'];

export interface UseUserProfileResult {
  user: User | null;
  profile: UserProfile | null;
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
  const credito = data.creditoCafeteria;
  return {
    uid,
    nombre,
    email,
    role,
    estadoAprobacion,
    creditoCafeteria: typeof credito === 'number' && Number.isFinite(credito) ? credito : undefined,
    codigoInvitacion: typeof data.codigoInvitacion === 'string' ? data.codigoInvitacion : undefined,
    creadoEn: data.creadoEn,
  };
}

interface EstadoPerfil {
  uid: string | null;
  profile: UserProfile | null;
  error: unknown;
}

const SIN_PERFIL: EstadoPerfil = { uid: null, profile: null, error: null };

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
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!activo) return;
        setEstado({ uid, profile: normalizarPerfil(uid, snap.exists() ? snap.data() : undefined), error: null });
      },
      (error) => {
        if (!activo) return;
        setEstado((prev) => ({ uid, profile: prev.uid === uid ? prev.profile : null, error }));
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
    loading: authLoading || (uid !== null && !perfilDeEsteUsuario),
    error: perfilDeEsteUsuario ? estado.error : null,
    reintentar,
  };
}
