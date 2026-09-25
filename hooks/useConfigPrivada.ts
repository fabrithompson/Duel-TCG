import { useCallback, useEffect, useRef, useState } from 'react';
import { Timestamp, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getRandomBytes } from 'expo-crypto';
import { db } from '../config/firebase';
import { useToast } from '../contexts/ToastContext';
import { ConfigPrivada, VIGENCIA_CODIGO_DIAS, generarCodigoInvitacion } from '../lib/config';
import { aMilis } from '../lib/fecha';
import { ahoraServidor } from '../lib/reloj';
import { mensajeError } from '../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS, esperarConfirmacion } from '../lib/escritura';

const CONFIG_PRIVADO_REF = doc(db, 'config', 'privado');

interface UseConfigPrivadaResult {
  config: ConfigPrivada;
  cargando: boolean;
  error: unknown;
  reintentar: () => void;
  generando: boolean;
  /** Devuelve el código nuevo, o null si no se pudo (el error ya se avisó con un toast). */
  generarCodigo: () => Promise<string | null>;
}

function normalizarPrivada(raw: unknown): ConfigPrivada {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const codigo = r.codigoInvitacion;
  return { codigoInvitacion: typeof codigo === 'string' && codigo.trim() ? codigo.trim() : null, codigoVenceMs: aMilis(r.codigoVenceEn) };
}

// Solo el admin puede leer config/privado: con `habilitado` en false no se escucha nada.
export function useConfigPrivada(habilitado: boolean): UseConfigPrivadaResult {
  const { mostrar } = useToast();
  const [config, setConfig] = useState<ConfigPrivada>({ codigoInvitacion: null, codigoVenceMs: null });
  const [cargando, setCargando] = useState(habilitado);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const [generando, setGenerando] = useState(false);
  const generandoRef = useRef(false);

  useEffect(() => {
    if (!habilitado) {
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    const unsub = onSnapshot(
      CONFIG_PRIVADO_REF,
      (snap) => {
        setConfig(normalizarPrivada(snap.data()));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [habilitado, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const generarCodigo = useCallback(async (): Promise<string | null> => {
    if (generandoRef.current) return null;
    generandoRef.current = true;
    setGenerando(true);
    try {
      const codigo = generarCodigoInvitacion(getRandomBytes(8));
      const codigoVenceEn = Timestamp.fromMillis(ahoraServidor() + VIGENCIA_CODIGO_DIAS * 86_400_000);
      const r = await esperarConfirmacion(setDoc(CONFIG_PRIVADO_REF, { codigoInvitacion: codigo, codigoVenceEn }, { merge: true }), ESPERA_ESCRITURA_MS, (e) =>
        mostrar(mensajeError(e, 'No se pudo guardar el código.'), 'error')
      );
      // Sin señal el código todavía no vale para registrarse: se avisa en vez de invitar a compartirlo.
      if (r === 'pendiente') mostrar(`Código generado. ${AVISO_SIN_SENAL} Compartilo cuando se confirme.`, 'info');
      else mostrar('Código nuevo listo para compartir', 'ok');
      return codigo;
    } catch (e) {
      mostrar(mensajeError(e, 'No se pudo generar el código. Probá de nuevo.'), 'error');
      return null;
    } finally {
      generandoRef.current = false;
      setGenerando(false);
    }
  }, [mostrar]);

  return { config, cargando, error, reintentar, generando, generarCodigo };
}
