import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

// Si se entra directo a Equipo (desde Hoy, con withAnchor), debajo queda Ajustes: "← Ajustes" vuelve ahí y no a otra pestaña.
export const unstable_settings = { initialRouteName: 'index' };

export default function AjustesLayout() {
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
