import { Linking, Platform, StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography } from '../constants/theme';

// Google Play pide la política de privacidad también dentro de la app. Es la página public/privacidad.html
// de la versión web: en web, la del mismo sitio; en el teléfono, la del proyecto de Firebase.
export const URL_PRIVACIDAD =
  Platform.OS === 'web' ? '/privacidad' : `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.web.app/privacidad`;

export default function LinkPrivacidad({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => void Linking.openURL(URL_PRIVACIDAD).catch(() => undefined)}
      style={[styles.caja, style]}
      hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
      accessibilityRole="link"
    >
      <Text style={[styles.texto, { color: colors.dim }]}>Política de privacidad</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  caja: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  texto: { fontFamily: Typography.fontFamily.regular, fontSize: 12, textDecorationLine: 'underline' },
});
