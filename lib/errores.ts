// Mensajes de error en español para códigos de Firebase (Auth y Firestore).

const MENSAJES: Record<string, string> = {
  'permission-denied': 'No tenés permiso para hacer esto con tu perfil.',
  unavailable: 'Sin conexión: no se pudo completar. Probá de nuevo cuando vuelva la señal.',
  'deadline-exceeded': 'La conexión está muy lenta. Probá de nuevo.',
  'not-found': 'Eso ya no existe — puede que alguien lo haya borrado.',
  'failed-precondition': 'Falta configurar algo en la base de datos (índice o reglas).',
  'resource-exhausted': 'Se alcanzó el límite de uso de la base de datos. Probá en un rato.',
  unauthenticated: 'Tu sesión venció. Volvé a iniciar sesión.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese email.',
  'auth/invalid-email': 'El email no es válido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Podés iniciar sesión.',
  'auth/weak-password': 'La contraseña es muy débil. Usá al menos 8 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y probá de nuevo.',
  'auth/network-request-failed': 'Error de conexión. Verificá tu internet.',
  'auth/requires-recent-login': 'Por seguridad, volvé a ingresar tu contraseña actual.',
  'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
};

export function codigoError(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

export function mensajeError(error: unknown, porDefecto = 'Algo salió mal. Probá de nuevo.'): string {
  const codigo = codigoError(error);
  if (codigo && MENSAJES[codigo]) return MENSAJES[codigo];
  // Firestore a veces antepone "firestore/".
  const corto = codigo?.replace(/^firestore\//, '');
  if (corto && MENSAJES[corto]) return MENSAJES[corto];
  return porDefecto;
}

export const MENSAJE_FALTA_INDICE =
  'Los índices de Firestore no están desplegados o todavía se están creando. Avisale al encargado del local (firebase deploy --only firestore:indexes).';

/** Las consultas con índice compuesto fallan con failed-precondition hasta que el índice existe. */
export function esFaltaDeIndice(error: unknown): boolean {
  return codigoError(error)?.replace(/^firestore\//, '') === 'failed-precondition';
}
