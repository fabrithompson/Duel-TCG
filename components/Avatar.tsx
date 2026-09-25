import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type ColorValue } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { esUrlFoto } from '../lib/users';

interface Props {
  readonly fotoUrl?: string | null;
  /** Lado total, borde incluido. */
  readonly tamano: number;
  /** Aro de color (el del rol); sin él, un borde sutil. */
  readonly borde?: ColorValue;
  /** Radio de las esquinas; por defecto, círculo. */
  readonly radio?: number;
  readonly cargando?: boolean;
}

// Foto de perfil o, si no hay (o no carga), la silueta neutra de cabeza y hombros.
export default function Avatar({ fotoUrl, tamano, borde, radio, cargando = false }: Props) {
  const { colors } = useTheme();
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [fotoUrl]);

  const conFoto = esUrlFoto(fotoUrl) && !fallo;
  const anchoBorde = borde ? 1.5 : 1;
  const lado = tamano - anchoBorde * 2;
  const r = radio ?? tamano / 2;

  return (
    <View
      style={[
        styles.caja,
        { width: tamano, height: tamano, borderRadius: r, borderWidth: anchoBorde, borderColor: borde ?? colors.line, backgroundColor: colors.line },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {conFoto ? (
        <Image source={{ uri: fotoUrl }} style={{ width: lado, height: lado }} resizeMode="cover" onError={() => setFallo(true)} />
      ) : (
        <Silueta lado={lado} color={colors.dim} />
      )}
      {cargando ? (
        <View style={[StyleSheet.absoluteFill, styles.velo, { backgroundColor: colors.shade }]}>
          <ActivityIndicator color={colors.br} />
        </View>
      ) : null}
    </View>
  );
}

function Silueta({ lado, color }: { readonly lado: number; readonly color: ColorValue }) {
  const cabeza = lado * 0.4;
  const cuello = lado * 0.18;
  const hombros = lado * 0.86;
  return (
    <View style={{ width: lado, height: lado }}>
      <View style={{ position: 'absolute', top: lado * 0.17, left: (lado - cabeza) / 2, width: cabeza, height: cabeza, borderRadius: cabeza / 2, backgroundColor: color }} />
      <View style={{ position: 'absolute', top: lado * 0.5, left: (lado - cuello) / 2, width: cuello, height: lado * 0.2, backgroundColor: color }} />
      <View
        style={{
          position: 'absolute',
          top: lado * 0.64,
          left: (lado - hombros) / 2,
          width: hombros,
          height: lado * 0.5,
          borderTopLeftRadius: hombros / 2,
          borderTopRightRadius: hombros / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  velo: { alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
});
