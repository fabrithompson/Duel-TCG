import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * true mientras la pantalla es la visible. Fuera de un navegador (tests, pantallas sueltas) se
 * considera visible. Las pestañas y los stacks no desmontan lo que queda atrás: sin esto, una
 * pantalla oculta seguía influyendo (por ejemplo, en dónde aparece el aviso).
 */
export function useEnFoco(): boolean {
  const navigation = useContext(NavigationContext);
  const [enFoco, setEnFoco] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return undefined;
    setEnFoco(navigation.isFocused());
    const alEnfocar = navigation.addListener('focus', () => setEnFoco(true));
    const alSalir = navigation.addListener('blur', () => setEnFoco(false));
    return () => {
      alEnfocar();
      alSalir();
    };
  }, [navigation]);

  return enFoco;
}
