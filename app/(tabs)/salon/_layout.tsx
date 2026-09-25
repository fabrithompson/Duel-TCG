import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

// Al entrar directo a una pantalla interna (Pedido desde Hoy, con withAnchor), debajo queda la raíz de la pestaña.
export const unstable_settings = { initialRouteName: 'index' };

export default function SalonLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
