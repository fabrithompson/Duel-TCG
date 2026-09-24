import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { CONFIG_DEFAULT, ConfigLocal, normalizarConfig } from '../lib/config';

interface ConfigContextValue {
  config: ConfigLocal;
  /** true hasta el primer snapshot (o error) de `config/publico`. */
  cargando: boolean;
  /** Error de lectura: la app sigue con los defaults, pero Ajustes no debería editar a ciegas. */
  error: unknown;
  reintentar: () => void;
  /** Merge parcial sobre `config/publico`. Solo admin (lo hacen cumplir las reglas). */
  guardarConfig: (cambios: Partial<ConfigLocal>) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export const CONFIG_PUBLICO_REF = doc(db, 'config', 'publico');

export function ConfigProvider({ children }: { readonly children: React.ReactNode }) {
  const [config, setConfig] = useState<ConfigLocal>(CONFIG_DEFAULT);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      CONFIG_PUBLICO_REF,
      (snap) => {
        setConfig(normalizarConfig(snap.exists() ? snap.data() : undefined));
        setError(null);
        setCargando(false);
      },
      (e) => {
        setError(e);
        setCargando(false);
      }
    );
    return unsub;
  }, [intento]);

  const reintentar = useCallback(() => {
    setCargando(true);
    setIntento((n) => n + 1);
  }, []);

  const guardarConfig = useCallback(async (cambios: Partial<ConfigLocal>) => {
    await setDoc(CONFIG_PUBLICO_REF, cambios, { merge: true });
  }, []);

  const value = useMemo(
    () => ({ config, cargando, error, reintentar, guardarConfig }),
    [config, cargando, error, reintentar, guardarConfig]
  );
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig debe usarse dentro de <ConfigProvider>.');
  return ctx;
}
