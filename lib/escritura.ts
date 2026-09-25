// Escrituras comunes (setDoc, updateDoc, batch) con la caché en memoria de Firestore:
// sin señal se aplican en local pero la promesa no resuelve hasta reconectar. Esperarla
// dejaba botones girando para siempre; se espera un rato y después se avisa.

/** Cuánto se espera la confirmación antes de avisar que quedó pendiente. */
export const ESPERA_ESCRITURA_MS = 4000;

/** Se agrega al aviso cuando la escritura quedó en cola. */
export const AVISO_SIN_SENAL = 'Sin señal: se envía cuando vuelva, si no cerrás la app.';

export async function esperarConfirmacion(
  escritura: Promise<unknown>,
  ms: number,
  onErrorTardio: (error: unknown) => void
): Promise<'confirmado' | 'pendiente'> {
  let vencido = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<'pendiente'>((resolve) => {
    timer = setTimeout(() => {
      vencido = true;
      resolve('pendiente');
    }, ms);
  });
  const confirmada = escritura.then(
    () => 'confirmado' as const,
    (error: unknown) => {
      if (!vencido) throw error;
      onErrorTardio(error);
      return 'pendiente' as const;
    }
  );
  try {
    return await Promise.race([confirmada, tope]);
  } finally {
    clearTimeout(timer);
  }
}
