import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTheme, ThemeMode, ThemeTokens } from '../constants/theme';
import { useConfig } from './ConfigContext';

/** 'auto' = sigue la preferencia del local (o la del sistema si el local no fija una). */
export type PreferenciaTema = ThemeMode | 'auto';

const CLAVE_TEMA = 'duel.preferenciaTema';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeTokens;
  preferencia: PreferenciaTema;
  setPreferencia: (p: PreferenciaTema) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const system = useColorScheme();
  const { config } = useConfig();
  const [preferencia, setPreferenciaState] = useState<PreferenciaTema>('auto');

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_TEMA)
      .then((valor) => {
        if (valor === 'day' || valor === 'night' || valor === 'auto') setPreferenciaState(valor);
      })
      .catch(() => undefined);
  }, []);

  const setPreferencia = useCallback((p: PreferenciaTema) => {
    setPreferenciaState(p);
    AsyncStorage.setItem(CLAVE_TEMA, p).catch(() => undefined);
  }, []);

  const modoAuto: ThemeMode = config.oscuroPorDefecto || system === 'dark' ? 'night' : 'day';
  const mode: ThemeMode = preferencia === 'auto' ? modoAuto : preferencia;
  const colors = useMemo(() => getTheme(mode, config.marca ?? undefined), [mode, config.marca]);

  const toggleMode = useCallback(() => {
    setPreferencia(mode === 'day' ? 'night' : 'day');
  }, [mode, setPreferencia]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors, preferencia, setPreferencia, toggleMode }),
    [mode, colors, preferencia, setPreferencia, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>.');
  return ctx;
}
