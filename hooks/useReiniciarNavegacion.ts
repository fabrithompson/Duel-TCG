import { useCallback } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';

type DestinoRaiz = '(tabs)' | 'index';

/**
 * Deja el stack raíz con una sola pantalla. Con router.replace, el splash
 * quedaba debajo de las pestañas después de iniciar sesión y el "atrás" de
 * Android volvía al splash (que redirigía de nuevo) en vez de salir de la app.
 */
export function useReiniciarNavegacion(): (destino: DestinoRaiz) => void {
  const nav = useNavigationContainerRef();
  return useCallback(
    (destino: DestinoRaiz) => {
      nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: destino }] }));
    },
    [nav]
  );
}
