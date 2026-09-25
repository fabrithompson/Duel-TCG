import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ROLE_LABEL, Role } from '../constants/roles';
import { TonoToast, useToast } from '../contexts/ToastContext';
import { useUserProfileContext } from '../contexts/UserProfileContext';
import { mensajeError } from '../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS, esperarConfirmacion } from '../lib/escritura';
import { aMilis } from '../lib/fecha';
import { esUrlFoto, type EstadoAprobacion } from '../lib/users';

export type RolStaff = 'admin' | 'mozo' | 'juez';
export const ROLES_STAFF: readonly RolStaff[] = ['admin', 'mozo', 'juez'];

export interface MiembroEquipo {
  uid: string;
  nombre: string;
  email: string;
  role: Role;
  /** null = documento viejo sin estado; las reglas lo tratan como sin acceso. */
  estadoAprobacion: EstadoAprobacion | null;
  creadoEnMs: number | null;
  /** Confirmó su email con el link de verificación (lo marca su propia app, validado por las reglas). */
  emailVerificado: boolean;
  fotoUrl: string | null;
}

type CambioUsuario = { role: RolStaff } | { estadoAprobacion: EstadoAprobacion };

interface UseEquipoResult {
  pendientes: MiembroEquipo[];
  activos: MiembroEquipo[];
  rechazados: MiembroEquipo[];
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
  miUid: string | null;
  estaOcupado: (uid: string) => boolean;
  aprobar: (m: MiembroEquipo) => Promise<boolean>;
  rechazar: (m: MiembroEquipo) => Promise<boolean>;
  cambiarRol: (m: MiembroEquipo, rol: RolStaff) => Promise<boolean>;
  quitarAcceso: (m: MiembroEquipo) => Promise<boolean>;
  reactivar: (m: MiembroEquipo) => Promise<boolean>;
}

const ROLES_VALIDOS: readonly Role[] = ['admin', 'mozo', 'juez', 'jugador'];
const ESTADOS_VALIDOS: readonly EstadoAprobacion[] = ['pendiente', 'aprobado', 'rechazado'];
const ORDEN_ROL: Record<Role, number> = { admin: 0, mozo: 1, juez: 2, jugador: 3 };

export function rolEnTexto(rol: Role): string {
  return ROLE_LABEL[rol].toLocaleLowerCase('es');
}

function normalizarMiembro(uid: string, data: Record<string, unknown>): MiembroEquipo | null {
  const role = ROLES_VALIDOS.find((r) => r === data.role);
  if (!role) return null;
  const nombre = typeof data.nombre === 'string' && data.nombre.trim() ? data.nombre.trim() : 'Sin nombre';
  return {
    uid,
    nombre,
    email: typeof data.email === 'string' ? data.email : '',
    role,
    estadoAprobacion: ESTADOS_VALIDOS.find((e) => e === data.estadoAprobacion) ?? null,
    creadoEnMs: aMilis(data.creadoEn),
    emailVerificado: data.emailVerificado === true,
    fotoUrl: esUrlFoto(data.fotoUrl) ? data.fotoUrl : null,
  };
}

function porRolYNombre(a: MiembroEquipo, b: MiembroEquipo): number {
  return ORDEN_ROL[a.role] - ORDEN_ROL[b.role] || a.nombre.localeCompare(b.nombre, 'es');
}

function masNuevoPrimero(a: MiembroEquipo, b: MiembroEquipo): number {
  return (b.creadoEnMs ?? 0) - (a.creadoEnMs ?? 0) || a.nombre.localeCompare(b.nombre, 'es');
}

/**
 * Solicitudes y staff del local (solo admin). Con `soloPendientes` escucha únicamente
 * las solicitudes, para el contador de Ajustes sin bajar todo el equipo.
 */
export function useEquipo(opciones: { readonly soloPendientes?: boolean } = {}): UseEquipoResult {
  const soloPendientes = opciones.soloPendientes ?? false;
  const { user, profile } = useUserProfileContext();
  const { mostrar } = useToast();
  const esAdmin = profile?.role === 'admin' && profile.estadoAprobacion === 'aprobado';
  const miUid = user?.uid ?? null;

  const [pendientes, setPendientes] = useState<MiembroEquipo[]>([]);
  const [staff, setStaff] = useState<MiembroEquipo[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [cargandoStaff, setCargandoStaff] = useState(true);
  const [errorPendientes, setErrorPendientes] = useState<unknown>(null);
  const [errorStaff, setErrorStaff] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());
  const ocupadosRef = useRef(new Set<string>());

  useEffect(() => {
    if (!esAdmin) {
      setPendientes([]);
      setCargandoPendientes(false);
      return undefined;
    }
    setCargandoPendientes(true);
    const q = query(collection(db, 'users'), where('estadoAprobacion', '==', 'pendiente'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs
          .map((d) => normalizarMiembro(d.id, d.data()))
          .filter((m): m is MiembroEquipo => m !== null)
          .sort(masNuevoPrimero);
        setPendientes(lista);
        setErrorPendientes(null);
        setCargandoPendientes(false);
      },
      (e) => {
        setErrorPendientes(e);
        setCargandoPendientes(false);
      }
    );
    return unsub;
  }, [esAdmin, intento]);

  useEffect(() => {
    if (!esAdmin || soloPendientes) {
      setStaff([]);
      setCargandoStaff(false);
      return undefined;
    }
    setCargandoStaff(true);
    const q = query(collection(db, 'users'), where('role', 'in', [...ROLES_STAFF]));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const lista = snap.docs
          .map((d) => normalizarMiembro(d.id, d.data()))
          .filter((m): m is MiembroEquipo => m !== null)
          .sort(porRolYNombre);
        setStaff(lista);
        setErrorStaff(null);
        setCargandoStaff(false);
      },
      (e) => {
        setErrorStaff(e);
        setCargandoStaff(false);
      }
    );
    return unsub;
  }, [esAdmin, soloPendientes, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const estaOcupado = useCallback((uid: string) => ocupados.has(uid), [ocupados]);

  const ejecutar = useCallback(
    async (m: MiembroEquipo, cambio: CambioUsuario, ok: string, tono: TonoToast = 'ok'): Promise<boolean> => {
      if (m.uid === miUid) {
        mostrar('No podés cambiar tu propia cuenta.', 'error');
        return false;
      }
      if (ocupadosRef.current.has(m.uid)) return false;
      ocupadosRef.current.add(m.uid);
      setOcupados(new Set(ocupadosRef.current));
      try {
        const r = await esperarConfirmacion(updateDoc(doc(db, 'users', m.uid), cambio), ESPERA_ESCRITURA_MS, (e) =>
          mostrar(mensajeError(e, 'No se pudo guardar el cambio.'), 'error')
        );
        mostrar(r === 'pendiente' ? `${ok}. ${AVISO_SIN_SENAL}` : ok, r === 'pendiente' ? 'info' : tono);
        return true;
      } catch (e) {
        mostrar(mensajeError(e, 'No se pudo guardar el cambio. Probá de nuevo.'), 'error');
        return false;
      } finally {
        ocupadosRef.current.delete(m.uid);
        setOcupados(new Set(ocupadosRef.current));
      }
    },
    [miUid, mostrar]
  );

  const aprobar = useCallback(
    (m: MiembroEquipo) => {
      // Nadie se registra como admin desde la app: una solicitud así es sospechosa.
      if (m.role === 'admin') {
        mostrar('Una solicitud como admin no se aprueba desde acá.', 'error');
        return Promise.resolve(false);
      }
      return ejecutar(m, { estadoAprobacion: 'aprobado' }, `${m.nombre} ya puede entrar como ${rolEnTexto(m.role)}`);
    },
    [ejecutar, mostrar]
  );

  const rechazar = useCallback(
    (m: MiembroEquipo) => ejecutar(m, { estadoAprobacion: 'rechazado' }, `Rechazaste la solicitud de ${m.nombre}`, 'info'),
    [ejecutar]
  );

  const cambiarRol = useCallback(
    (m: MiembroEquipo, rol: RolStaff) => {
      if (m.role === rol) return Promise.resolve(true);
      return ejecutar(m, { role: rol }, `${m.nombre} ahora es ${rolEnTexto(rol)}`);
    },
    [ejecutar]
  );

  const quitarAcceso = useCallback(
    (m: MiembroEquipo) => ejecutar(m, { estadoAprobacion: 'rechazado' }, `${m.nombre} ya no puede entrar`, 'info'),
    [ejecutar]
  );

  const reactivar = useCallback(
    (m: MiembroEquipo) => ejecutar(m, { estadoAprobacion: 'aprobado' }, `${m.nombre} puede volver a entrar`),
    [ejecutar]
  );

  const activos = useMemo(() => staff.filter((m) => m.estadoAprobacion === 'aprobado'), [staff]);
  const rechazados = useMemo(
    () => staff.filter((m) => m.estadoAprobacion !== 'aprobado' && m.estadoAprobacion !== 'pendiente'),
    [staff]
  );

  return {
    pendientes,
    activos,
    rechazados,
    cargando: esAdmin && (cargandoPendientes || (!soloPendientes && cargandoStaff)),
    error: errorPendientes ?? errorStaff,
    reintentar,
    miUid,
    estaOcupado,
    aprobar,
    rechazar,
    cambiarRol,
    quitarAcceso,
    reactivar,
  };
}
