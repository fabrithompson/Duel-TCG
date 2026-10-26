import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile, User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Typography } from '../../constants/theme';
import { codigoError, mensajeError } from '../../lib/errores';
import { advertencia, exito, fallo } from '../../lib/haptics';
import FormField from '../../components/FormField';
import Button from '../../components/Button';
import { ErrorBanner } from '../../components/ui';
import LinkPrivacidad from '../../components/LinkPrivacidad';
import { altaDirectorio } from '../../lib/jugadores';
import { useReiniciarNavegacion } from '../../hooks/useReiniciarNavegacion';

// Registro de jugadores. Las cuentas de mozo y juez las crea el admin en Ajustes > Equipo.

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE = { min: 2, max: 60 };
const PASSWORD_MIN = 8;
// Con caché en memoria, sin señal el alta no falla: queda esperando. Se corta para no dejar un spinner eterno.
const ESPERA_ALTA_MS = 15000;

interface Errores {
  nombre?: string;
  email?: string;
  password?: string;
}

function validar(nombre: string, email: string, password: string, completando: boolean): Errores {
  const errores: Errores = {};
  if (nombre.length < NOMBRE.min || nombre.length > NOMBRE.max) {
    errores.nombre = `Escribí tu nombre (entre ${NOMBRE.min} y ${NOMBRE.max} caracteres).`;
  }
  if (!completando) {
    if (!email) errores.email = 'Escribí tu email.';
    else if (!EMAIL_VALIDO.test(email)) errores.email = 'Revisá el email: no parece válido.';
    if (password.length < PASSWORD_MIN) errores.password = `Usá al menos ${PASSWORD_MIN} caracteres.`;
  }
  return errores;
}

export default function RegisterScreen() {
  const router = useRouter();
  const reiniciar = useReiniciarNavegacion();
  const { completar } = useLocalSearchParams<{ completar?: string }>();
  // La cuenta de Auth existe pero el perfil no llegó a guardarse (corte de red en el alta).
  const usuarioSinPerfil: User | null = completar === '1' ? auth.currentUser : null;
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const limpiarError = (campo: keyof Errores) => {
    setErrorGeneral(null);
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const volver = () => {
    if (usuarioSinPerfil) router.replace('/(tabs)');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const fallar = (campos: Errores, general: string | null) => {
    setErrores(campos);
    setErrorGeneral(general);
    fallo();
  };

  const crear = async () => {
    if (enCurso.current) return;
    const nombreLimpio = nombre.trim().replace(/\s+/g, ' ');
    const mail = email.trim();
    const nuevos = validar(nombreLimpio, mail, password, !!usuarioSinPerfil);
    setErrores(nuevos);
    setErrorGeneral(null);
    if (Object.keys(nuevos).length > 0) {
      advertencia();
      return;
    }

    enCurso.current = true;
    setEnviando(true);
    try {
      let usuario: User;
      if (usuarioSinPerfil) {
        usuario = usuarioSinPerfil;
      } else {
        try {
          usuario = (await createUserWithEmailAndPassword(auth, mail, password)).user;
        } catch (e) {
          const c = codigoError(e);
          if (c === 'auth/email-already-in-use') fallar({ email: 'Ya existe una cuenta con ese email. Iniciá sesión: si el registro quedó a medias, la app te deja completarlo.' }, null);
          else if (c === 'auth/invalid-email') fallar({ email: mensajeError(e) }, null);
          else if (c === 'auth/weak-password') fallar({ password: mensajeError(e) }, null);
          else fallar({}, mensajeError(e, 'No pudimos crear la cuenta. Probá de nuevo.'));
          return;
        }
      }

      // El displayName es cosmético (el nombre real vive en users/{uid}); si falla, el alta sigue.
      await updateProfile(usuario, { displayName: nombreLimpio }).catch(() => undefined);

      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', usuario.uid), {
          uid: usuario.uid,
          nombre: nombreLimpio,
          email: usuario.email ?? mail.toLowerCase(),
          role: 'jugador',
          estadoAprobacion: 'aprobado',
          creadoEn: serverTimestamp(),
        });
        batch.set(doc(db, 'jugadores', usuario.uid), { ...altaDirectorio(usuario.uid, nombreLimpio), creadoEn: serverTimestamp() });
        let vencido = false;
        await Promise.race([
          batch.commit(),
          new Promise<never>((_, rechazar) =>
            setTimeout(() => {
              vencido = true;
              rechazar(new Error('sin-conexion'));
            }, ESPERA_ALTA_MS)
          ),
        ]).catch((e: unknown) => {
          if (vencido) throw Object.assign(new Error('sin-conexion'), { code: 'unavailable' });
          throw e;
        });
      } catch (e) {
        // Sin red la cuenta queda creada: al volver la señal, iniciar sesión lleva a completar el registro.
        fallar({}, `${mensajeError(e, 'No pudimos guardar tu perfil.')} Cuando vuelva la conexión, iniciá sesión y completá el registro.`);
        return;
      }

      exito();
      mostrar(`Listo, ${nombreLimpio.split(' ')[0]}: ya tenés tu cuenta.`, 'ok');
      reiniciar('(tabs)');
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={volver}
            style={styles.back}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={[styles.backText, { color: colors.dim }]}>← Volver</Text>
          </TouchableOpacity>

          <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
            {usuarioSinPerfil ? 'Completá tu registro' : 'Crear cuenta'}
          </Text>
          {usuarioSinPerfil ? (
            <Text style={[styles.completarTexto, { color: colors.dim }]}>
              Cuenta {usuarioSinPerfil.email ?? ''}. Escribí tu nombre para terminar el alta.
            </Text>
          ) : null}

          <View style={styles.campos}>
            <FormField
              label="Nombre y apellido"
              value={nombre}
              onChangeText={(t) => {
                setNombre(t);
                limpiarError('nombre');
              }}
              error={errores.nombre}
              placeholder="Como te conocen en el local"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType={usuarioSinPerfil ? 'go' : 'next'}
              maxLength={NOMBRE.max}
              editable={!enviando}
              onSubmitEditing={() => {
                if (usuarioSinPerfil) void crear();
                else emailRef.current?.focus();
              }}
              submitBehavior={usuarioSinPerfil ? 'blurAndSubmit' : 'submit'}
            />
            {usuarioSinPerfil ? null : (
            <FormField
              ref={emailRef}
              label="Email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                limpiarError('email');
              }}
              error={errores.email}
              placeholder="tu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              maxLength={254}
              editable={!enviando}
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            )}
            {usuarioSinPerfil ? null : (
            <FormField
              ref={passwordRef}
              label="Contraseña"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                limpiarError('password');
              }}
              error={errores.password}
              placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
              secureToggle
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              maxLength={128}
              editable={!enviando}
              onSubmitEditing={() => {
                void crear();
              }}
              submitBehavior="blurAndSubmit"
            />
            )}
          </View>

          <View style={styles.sinNota} />

          {errorGeneral ? <ErrorBanner mensaje={errorGeneral} /> : null}

          <Button
            label={usuarioSinPerfil ? 'Completar registro' : 'Crear cuenta'}
            onPress={() => {
              void crear();
            }}
            loading={enviando}
          />

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            disabled={enviando}
            style={styles.loginBox}
            accessibilityRole="link"
            accessibilityLabel="¿Ya tenés cuenta? Iniciá sesión"
          >
            <Text style={[styles.loginText, { color: colors.dim }]}>
              ¿Ya tenés cuenta? <Text style={[styles.loginLink, { color: colors.br }]}>Iniciá sesión</Text>
            </Text>
          </TouchableOpacity>
          <LinkPrivacidad />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 14, paddingBottom: 30 },
  back: { alignSelf: 'flex-start', marginBottom: 12, minHeight: 32, justifyContent: 'center' },
  backText: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  title: { fontFamily: Typography.display.bold, fontSize: 27, letterSpacing: -0.8 },
  completarTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  campos: { gap: 12, marginTop: 24 },
  sinNota: { height: 18 },
  loginBox: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 10, paddingHorizontal: 8 },
  loginText: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5 },
  loginLink: { fontFamily: Typography.fontFamily.semibold, textDecorationLine: 'underline' },
});
