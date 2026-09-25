import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import Constants from 'expo-constants';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import Screen, { LoadingScreen } from '../components/Screen';
import FormField from '../components/FormField';
import Button from '../components/Button';
import Chip from '../components/Chip';
import Avatar from '../components/Avatar';
import { Badge, Card, SectionLabel } from '../components/ui';
import { PreferenciaTema, useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useUserProfileContext } from '../contexts/UserProfileContext';
import { Typography, tabularNums } from '../constants/theme';
import { ROLE_LABEL } from '../constants/roles';
import { codigoError, mensajeError } from '../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS, esperarConfirmacion } from '../lib/escritura';
import { advertencia, fallo, tocar } from '../lib/haptics';
import { formatARS } from '../lib/pedido';
import type { UserProfile } from '../lib/users';
import { useReiniciarNavegacion } from '../hooks/useReiniciarNavegacion';
import { useMiCredito } from '../hooks/useDirectorioJugadores';
import UsosCredito from '../components/UsosCredito';
import { normalizarBusqueda } from '../lib/jugadores';
import { preguntar } from '../lib/dialogo';
import { borrarFoto, mensajeErrorFoto, subirFoto } from '../lib/avatar';

const NOMBRE = { min: 2, max: 60 };
const PASSWORD_MIN = 8;

const TEMAS: readonly { id: PreferenciaTema; nombre: string }[] = [
  { id: 'auto', nombre: 'Automático' },
  { id: 'day', nombre: 'Día' },
  { id: 'night', nombre: 'Noche' },
];

interface ErroresPassword {
  actual?: string;
  nueva?: string;
  repetir?: string;
}

export default function CuentaScreen() {
  const { user, profile, loading } = useUserProfileContext();
  const [saliendo, setSaliendo] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!user || !profile) return saliendo ? <LoadingScreen /> : <Redirect href="/" />;
  return <Cuenta user={user} profile={profile} onSaliendo={setSaliendo} />;
}

interface CuentaProps {
  readonly user: User;
  readonly profile: UserProfile;
  readonly onSaliendo: (saliendo: boolean) => void;
}

function Cuenta({ user, profile, onSaliendo }: CuentaProps) {
  const reiniciar = useReiniciarNavegacion();
  const { colors, preferencia, setPreferencia } = useTheme();
  const { mostrar } = useToast();

  const [nombre, setNombre] = useState(profile.nombre);
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erroresPass, setErroresPass] = useState<ErroresPassword>({});
  const [guardandoPass, setGuardandoPass] = useState(false);

  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoOcupada = useRef(false);

  useEffect(() => {
    setNombre(profile.nombre);
  }, [profile.nombre]);

  const esJugador = profile.role === 'jugador';
  // Juez y admin pueden jugar torneos: si ganaron crédito, lo ven igual que un jugador.
  const puedeJugar = esJugador || profile.role === 'juez' || profile.role === 'admin';
  const { credito } = useMiCredito(puedeJugar ? profile.uid : null);
  const muestraCredito = esJugador || (credito ?? 0) > 0;
  const tonoRol = profile.role === 'juez' || esJugador ? 'gold' : 'br';
  const nombreLimpio = nombre.trim().replace(/\s+/g, ' ');
  const nombreCambiado = nombreLimpio !== profile.nombre;
  const version = Constants.expoConfig?.version;

  // Nombre y foto se copian al directorio de jugadores: el jugador siempre está, y el staff si se anotó a jugar.
  const estaEnDirectorio = async (): Promise<boolean> =>
    esJugador || (await getDoc(doc(db, 'jugadores', profile.uid)).then((s) => s.exists()).catch(() => false));

  const guardarFoto = async (fotoUrl: string | null) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', profile.uid), { fotoUrl });
    if (await estaEnDirectorio()) batch.update(doc(db, 'jugadores', profile.uid), { fotoUrl });
    return esperarConfirmacion(batch.commit(), ESPERA_ESCRITURA_MS, (e) => mostrar(mensajeErrorFoto(e), 'error'));
  };

  const conFoto = async (accion: () => Promise<void>) => {
    if (fotoOcupada.current) return;
    fotoOcupada.current = true;
    setSubiendoFoto(true);
    try {
      await accion();
    } catch (e) {
      mostrar(mensajeErrorFoto(e), 'error');
    } finally {
      fotoOcupada.current = false;
      setSubiendoFoto(false);
    }
  };

  const elegirFoto = async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      if (!permiso.canAskAgain) {
        preguntar('Sin acceso a tus fotos', 'Habilitá el acceso a las fotos en los ajustes del teléfono.', [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => void Linking.openSettings().catch(() => undefined) },
        ]);
      }
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (resultado.canceled || resultado.assets.length === 0) return;
    const uri = resultado.assets[0].uri;
    await conFoto(async () => {
      const anterior = profile.fotoUrl;
      const url = await subirFoto(profile.uid, uri);
      try {
        const r = await guardarFoto(url);
        mostrar(r === 'pendiente' ? `Foto actualizada. ${AVISO_SIN_SENAL}` : 'Foto actualizada.', r === 'pendiente' ? 'info' : 'ok');
      } catch (e) {
        void borrarFoto(url);
        throw e;
      }
      if (anterior) void borrarFoto(anterior);
    });
  };

  const quitarFoto = () =>
    conFoto(async () => {
      const anterior = profile.fotoUrl;
      await guardarFoto(null);
      if (anterior) void borrarFoto(anterior);
      mostrar('Foto quitada.', 'ok');
    });

  const opcionesFoto = () => {
    tocar();
    if (!profile.fotoUrl) {
      void elegirFoto();
      return;
    }
    preguntar('Foto de perfil', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar foto', style: 'destructive', onPress: () => void quitarFoto() },
      { text: 'Elegir otra', onPress: () => void elegirFoto() },
    ]);
  };

  const guardarNombre = async () => {
    if (guardandoNombre || !nombreCambiado) return;
    if (nombreLimpio.length < NOMBRE.min || nombreLimpio.length > NOMBRE.max) {
      setErrorNombre(`Usá entre ${NOMBRE.min} y ${NOMBRE.max} caracteres.`);
      advertencia();
      return;
    }
    setGuardandoNombre(true);
    try {
      // El staff ve al jugador por el directorio: el nombre tiene que cambiar en los dos lados a la vez.
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', profile.uid), { nombre: nombreLimpio });
      if (await estaEnDirectorio()) batch.update(doc(db, 'jugadores', profile.uid), { nombre: nombreLimpio, nombreBusqueda: normalizarBusqueda(nombreLimpio) });
      const r = await esperarConfirmacion(batch.commit(), ESPERA_ESCRITURA_MS, (e) =>
        mostrar(mensajeError(e, 'No se pudo guardar el nombre.'), 'error')
      );
      // El displayName de Auth es secundario: el nombre que ve la app es el de users/{uid}.
      void updateProfile(user, { displayName: nombreLimpio }).catch(() => undefined);
      mostrar(r === 'pendiente' ? `Nombre actualizado. ${AVISO_SIN_SENAL}` : 'Nombre actualizado.', r === 'pendiente' ? 'info' : 'ok');
    } catch (e) {
      mostrar(mensajeError(e, 'No se pudo guardar el nombre. Probá de nuevo.'), 'error');
    } finally {
      setGuardandoNombre(false);
    }
  };

  const cambiarPassword = async () => {
    if (guardandoPass) return;
    const errores: ErroresPassword = {};
    if (!actual) errores.actual = 'Escribí tu contraseña actual.';
    if (nueva.length < PASSWORD_MIN) errores.nueva = `Usá al menos ${PASSWORD_MIN} caracteres.`;
    else if (nueva === actual) errores.nueva = 'Tiene que ser distinta de la actual.';
    if (repetir !== nueva) errores.repetir = 'No coincide con la contraseña nueva.';
    setErroresPass(errores);
    if (Object.keys(errores).length > 0) {
      advertencia();
      return;
    }
    if (!user.email) {
      mostrar('Tu cuenta no tiene email para verificar la contraseña. Hablá con el admin.', 'error');
      return;
    }

    setGuardandoPass(true);
    try {
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, actual));
      } catch (e) {
        const c = codigoError(e);
        if (c === 'auth/invalid-credential' || c === 'auth/wrong-password') {
          setErroresPass({ actual: 'La contraseña actual no es correcta.' });
          fallo();
        } else {
          mostrar(mensajeError(e, 'No pudimos verificar tu contraseña. Probá de nuevo.'), 'error');
        }
        return;
      }
      try {
        await updatePassword(user, nueva);
      } catch (e) {
        if (codigoError(e) === 'auth/weak-password') {
          setErroresPass({ nueva: mensajeError(e) });
          fallo();
        } else {
          mostrar(mensajeError(e, 'No se pudo cambiar la contraseña. Probá de nuevo.'), 'error');
        }
        return;
      }
      setActual('');
      setNueva('');
      setRepetir('');
      mostrar('Contraseña actualizada.', 'ok');
    } finally {
      setGuardandoPass(false);
    }
  };

  const salir = async () => {
    setCerrandoSesion(true);
    onSaliendo(true);
    try {
      await signOut(auth);
      reiniciar('index');
    } catch (e) {
      onSaliendo(false);
      setCerrandoSesion(false);
      mostrar(mensajeError(e, 'No se pudo cerrar la sesión. Probá de nuevo.'), 'error');
    }
  };

  const confirmarSalida = () => {
    preguntar('Cerrar sesión', `¿Salir de la cuenta de ${profile.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: () => {
          void salir();
        },
      },
    ]);
  };

  const limpiarErrorPass = (campo: keyof ErroresPassword) => {
    setErroresPass((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  return (
    <Screen back="Volver" title="Mi cuenta" keyboard contentStyle={styles.contenido}>
      <View style={styles.identidad}>
        <TouchableOpacity
          onPress={opcionesFoto}
          disabled={subiendoFoto}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={profile.fotoUrl ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}
          accessibilityState={{ busy: subiendoFoto }}
        >
          <Avatar fotoUrl={profile.fotoUrl} tamano={68} borde={colors[tonoRol]} cargando={subiendoFoto} />
          <Text style={[styles.fotoLink, { color: colors.br }]}>{profile.fotoUrl ? 'Cambiar' : 'Agregar foto'}</Text>
        </TouchableOpacity>
        <View style={styles.identidadTexts}>
          <Text style={[styles.nombre, { color: colors.ink }]} numberOfLines={2}>
            {profile.nombre}
          </Text>
          <Text style={[styles.email, { color: colors.dim }]} numberOfLines={1}>
            {profile.email || user.email || 'Sin email'}
          </Text>
          <Badge label={ROLE_LABEL[profile.role]} tone={tonoRol} />
        </View>
      </View>

      {muestraCredito ? (
        <Card style={styles.credito}>
          <Text style={[styles.creditoLabel, { color: colors.gold }]}>TU CRÉDITO EN LA BARRA</Text>
          <Text style={[styles.creditoValor, { color: colors.ink }, tabularNums(28)]}>{credito === null ? '—' : formatARS(credito)}</Text>
          <UsosCredito uid={profile.uid} />
        </Card>
      ) : null}

      <View style={styles.seccion}>
        <SectionLabel>Tu nombre</SectionLabel>
        <FormField
          label="Nombre y apellido"
          value={nombre}
          onChangeText={(t) => {
            setNombre(t);
            setErrorNombre(undefined);
          }}
          error={errorNombre}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={NOMBRE.max}
          editable={!guardandoNombre}
          returnKeyType="done"
          onSubmitEditing={() => {
            void guardarNombre();
          }}
        />
        <Button
          label="Guardar nombre"
          variant="secondary"
          onPress={() => {
            void guardarNombre();
          }}
          loading={guardandoNombre}
          disabled={!nombreCambiado}
        />
      </View>

      <View style={styles.seccion}>
        <SectionLabel>Contraseña</SectionLabel>
        <FormField
          label="Contraseña actual"
          value={actual}
          onChangeText={(t) => {
            setActual(t);
            limpiarErrorPass('actual');
          }}
          error={erroresPass.actual}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          maxLength={128}
          editable={!guardandoPass}
        />
        <FormField
          label="Contraseña nueva"
          value={nueva}
          onChangeText={(t) => {
            setNueva(t);
            limpiarErrorPass('nueva');
          }}
          error={erroresPass.nueva}
          placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          editable={!guardandoPass}
        />
        <FormField
          label="Repetir contraseña nueva"
          value={repetir}
          onChangeText={(t) => {
            setRepetir(t);
            limpiarErrorPass('repetir');
          }}
          error={erroresPass.repetir}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          editable={!guardandoPass}
        />
        <Button
          label="Cambiar contraseña"
          variant="secondary"
          onPress={() => {
            void cambiarPassword();
          }}
          loading={guardandoPass}
          disabled={!actual && !nueva && !repetir}
        />
      </View>

      <View style={styles.seccion}>
        <SectionLabel>Tema</SectionLabel>
        <View style={styles.chips}>
          {TEMAS.map((t) => (
            <Chip key={t.id} label={t.nombre} active={preferencia === t.id} onPress={() => setPreferencia(t.id)} />
          ))}
        </View>
      </View>

      <View style={styles.seccion}>
        <Button label="Cerrar sesión" variant="danger" onPress={confirmarSalida} loading={cerrandoSesion} />
      </View>

      {version ? <Text style={[styles.version, { color: colors.dim }]}>Versión {version}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingBottom: 40 },
  identidad: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  fotoLink: { fontFamily: Typography.fontFamily.semibold, fontSize: 11.5, textAlign: 'center', marginTop: 6 },
  identidadTexts: { flex: 1, gap: 4 },
  nombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 18, letterSpacing: -0.3 },
  email: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, marginBottom: 4 },
  credito: { marginTop: 20, gap: 4 },
  creditoLabel: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  creditoValor: { fontFamily: Typography.fontFamily.semibold, fontSize: 28 },
  seccion: { marginTop: 24, gap: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  version: { fontFamily: Typography.fontFamily.regular, fontSize: 11, textAlign: 'center', marginTop: 28 },
});
