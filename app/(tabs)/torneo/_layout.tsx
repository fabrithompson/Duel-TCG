import { Stack } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';

export default function TorneoLayout() {
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
