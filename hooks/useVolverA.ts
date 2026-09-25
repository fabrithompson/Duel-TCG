import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

/**
 * "Volver" de una pantalla anidada en una pestaña (Pedido, Equipo, Caja).
 * Si se llegó desde otra pestaña, el stack puede tener solo esta pantalla:
 * router.back() saltaría a Hoy y la raíz de la pestaña quedaría inaccesible.
 * router.canGoBack() no sirve para detectarlo porque también mira las Tabs.
 */
export function useVolverA(raiz: Href): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canDismiss()) router.back();
    else router.dismissTo(raiz);
  }, [router, raiz]);
}
