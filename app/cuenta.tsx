import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { doc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import Screen, { LoadingScreen } from '../components/Screen';
import FormField from '../components/FormField';
import Button from '../components/Button';
import Chip from '../components/Chip';
import { Badge, Card, SectionLabel } from '../components/ui';
import { PreferenciaTema, useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useUserProfileContext } from '../contexts/UserProfileContext';
import { Typography, tabularNums } from '../constants/theme';
import { ROLE_LABEL } from '../constants/roles';
import { codigoError, mensajeError } from '../lib/errores';
import { AVISO_SIN_SENAL, ESPERA_ESCRITURA_MS, esperarConfirmacion } from '../lib/escritura';
import { advertencia, fallo } from '../lib/haptics';
import { formatARS } from '../lib/pedido';
import type { UserProfile } from '../lib/users';
import { useReiniciarNavegacion } from '../hooks/useReiniciarNavegacion';
import { useMiCredito } from '../hooks/useDirectorioJugadores';
import UsosCredito from '../components/UsosCredito';
import { normalizarBusqueda } from '../lib/jugadores';
import { preguntar } from '../lib/dialogo';

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

  useEffect(() => {
    setNombre(profile.nombre);
  }, [profile.nombre]);

  const esJugador = profile.role === 'jugador';
  const { credito } = useMiCredito(esJugador ? profile.uid : null);
  const tonoRol = profile.role === 'juez' || esJugador ? 'gold' : 'br';
  const nombreLimpio = nombre.trim().replace(/\s+/g, ' ');
  const nombreCambiado = nombreLimpio !== profile.nombre;
  const version = Constants.expoConfig?.version;

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
      if (esJugador) batch.update(doc(db, 'jugadores', profile.uid), { nombre: nombreLimpio, nombreBusqueda: normalizarBusqueda(nombreLimpio) });
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
        <View style={[styles.avatar, { borderColor: colors[tonoRol] }]}>
          <Text style={[styles.avatarText, { color: colors[tonoRol] }]}>{profile.nombre.charAt(0).toUpperCase() || '?'}</Text>
        </View>
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

      {esJugador ? (
        <Card style={styles.credito}>
          <Text style={[styles.creditoLabel, { color: colors.gold }]}>TU CRÉDITO EN LA BARRA</Text>
          <Text style={[styles.creditoValor, { color: colors.ink }, tabularNums(28)]}>{credito === null ? '—' : formatARS(credito)}</Text>
          <Text style={[styles.ayuda, { color: colors.dim }]}>
            Lo ganás en los torneos y se descuenta cuando pagás en la barra.
          </Text>
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
        <Text style={[styles.ayuda, { color: colors.dim }]}>
          Automático sigue la preferencia del local o, si no hay, la del teléfono. Solo cambia en este dispositivo.
        </Text>
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
  avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Typography.fontFamily.semibold, fontSize: 26 },
  identidadTexts: { flex: 1, gap: 4 },
  nombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 18, letterSpacing: -0.3 },
  email: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, marginBottom: 4 },
  credito: { marginTop: 20, gap: 4 },
  creditoLabel: { fontFamily: Typography.fontFamily.bold, fontSize: 10, letterSpacing: 1.6 },
  creditoValor: { fontFamily: Typography.fontFamily.semibold, fontSize: 28 },
  ayuda: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 17 },
  seccion: { marginTop: 24, gap: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  version: { fontFamily: Typography.fontFamily.regular, fontSize: 11, textAlign: 'center', marginTop: 28 },
});
