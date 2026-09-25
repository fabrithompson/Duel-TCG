import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, deleteUser, signOut, updateProfile, User } from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Typography } from '../../constants/theme';
import { ROLE_LABEL, SelectableRole, requiereAprobacion } from '../../constants/roles';
import { codigoError, mensajeError } from '../../lib/errores';
import { advertencia, exito, fallo } from '../../lib/haptics';
import RoleSelector from '../../components/RoleSelector';
import FormField from '../../components/FormField';
import Button from '../../components/Button';
import { ErrorBanner } from '../../components/ui';
import { altaDirectorio } from '../../lib/jugadores';
import { useReiniciarNavegacion } from '../../hooks/useReiniciarNavegacion';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE = { min: 2, max: 60 };
const PASSWORD_MIN = 8;
const CODIGO_MAX = 32;
const CODIGO_INVALIDO = 'El código del local no es válido o ya venció. Pedile al admin uno nuevo.';
// Con caché en memoria, sin señal el alta no falla: queda esperando. Se corta para no dejar un spinner eterno.
const ESPERA_ALTA_MS = 15000;

interface Errores {
  nombre?: string;
  email?: string;
  password?: string;
  codigo?: string;
}

function validar(nombre: string, email: string, password: string, codigo: string, necesitaCodigo: boolean, completando: boolean): Errores {
  const errores: Errores = {};
  if (nombre.length < NOMBRE.min || nombre.length > NOMBRE.max) {
    errores.nombre = `Escribí tu nombre (entre ${NOMBRE.min} y ${NOMBRE.max} caracteres).`;
  }
  if (!completando) {
    if (!email) errores.email = 'Escribí tu email.';
    else if (!EMAIL_VALIDO.test(email)) errores.email = 'Revisá el email: no parece válido.';
    if (password.length < PASSWORD_MIN) errores.password = `Usá al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (necesitaCodigo && !codigo) errores.codigo = 'Pedile el código del local al admin.';
  else if (codigo.length > CODIGO_MAX) errores.codigo = 'El código es demasiado largo: revisalo con el admin.';
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
  const [role, setRole] = useState<SelectableRole>('jugador');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendienteComo, setPendienteComo] = useState<SelectableRole | null>(null);
  const enCurso = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const codigoRef = useRef<TextInput>(null);

  const necesitaCodigo = requiereAprobacion(role);

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
    const codigoLimpio = necesitaCodigo ? codigo.trim().toUpperCase() : '';
    const nuevos = validar(nombreLimpio, mail, password, codigoLimpio, necesitaCodigo, !!usuarioSinPerfil);
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
          role,
          estadoAprobacion: necesitaCodigo ? 'pendiente' : 'aprobado',
          creadoEn: serverTimestamp(),
          ...(necesitaCodigo ? { codigoInvitacion: codigoLimpio } : {}),
        });
        if (!necesitaCodigo) {
          batch.set(doc(db, 'jugadores', usuario.uid), { ...altaDirectorio(usuario.uid, nombreLimpio), creadoEn: serverTimestamp() });
        }
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
        const c = codigoError(e)?.replace(/^firestore\//, '');
        if (c === 'permission-denied' && necesitaCodigo) {
          // Código inválido: se borra la cuenta de Auth para poder reintentar con el código correcto y el mismo email.
          if (!usuarioSinPerfil) await deleteUser(usuario).catch(() => signOut(auth).catch(() => undefined));
          fallar({ codigo: CODIGO_INVALIDO }, null);
        } else {
          // Sin red la cuenta queda creada: al volver la señal, iniciar sesión lleva a completar el registro.
          fallar({}, `${mensajeError(e, 'No pudimos guardar tu perfil.')} Cuando vuelva la conexión, iniciá sesión y completá el registro.`);
        }
        return;
      }

      exito();
      if (necesitaCodigo) {
        await signOut(auth).catch(() => undefined);
        setPendienteComo(role);
      } else {
        mostrar(`Listo, ${nombreLimpio.split(' ')[0]}: ya tenés tu cuenta de jugador.`, 'ok');
        reiniciar('(tabs)');
      }
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  };

  if (pendienteComo) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
        <View style={styles.listo}>
          <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">
            Cuenta creada
          </Text>
          <View style={[styles.note, { borderColor: colors.gold }]}>
            <Text style={[styles.noteText, { color: colors.ink }]}>
              Tu cuenta de <Text style={[styles.noteFuerte, { color: colors.gold }]}>{ROLE_LABEL[pendienteComo]}</Text> quedó
              pendiente de aprobación. El admin la habilita desde su panel; cuando lo haga, entrá con tu email y contraseña.
            </Text>
          </View>
          <Button label="Ir a iniciar sesión" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </SafeAreaView>
    );
  }

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

          <Text style={[styles.title, styles.titleGap, { color: colors.ink }]} accessibilityRole="header">
            {usuarioSinPerfil ? 'Completá tu registro' : 'Crear cuenta'}
          </Text>
          {usuarioSinPerfil ? (
            <Text style={[styles.completarTexto, { color: colors.dim }]}>
              Cuenta {usuarioSinPerfil.email ?? ''}. Elegí tu perfil y tu nombre para terminar el alta.
            </Text>
          ) : null}

          <RoleSelector
            value={role}
            onChange={(r) => {
              setRole(r);
              setErrores((prev) => ({ ...prev, codigo: undefined }));
              setErrorGeneral(null);
            }}
            variant="grid"
            disabled={enviando}
          />

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
              returnKeyType="next"
              maxLength={NOMBRE.max}
              editable={!enviando}
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
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
              returnKeyType={necesitaCodigo ? 'next' : 'go'}
              maxLength={128}
              editable={!enviando}
              onSubmitEditing={() => {
                if (necesitaCodigo) codigoRef.current?.focus();
                else void crear();
              }}
              submitBehavior={necesitaCodigo ? 'submit' : 'blurAndSubmit'}
            />
            )}
            {necesitaCodigo ? (
              <FormField
                ref={codigoRef}
                label="Código del local"
                value={codigo}
                onChangeText={(t) => {
                  setCodigo(t);
                  limpiarError('codigo');
                }}
                error={errores.codigo}
                placeholder="Te lo da el admin"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="go"
                maxLength={CODIGO_MAX}
                editable={!enviando}
                onSubmitEditing={() => {
                  void crear();
                }}
              />
            ) : null}
          </View>

          <View style={[styles.note, styles.noteGap, { borderColor: colors.gold }]}>
            <Text style={[styles.noteText, { color: colors.ink }]}>
              <Text style={[styles.noteFuerte, { color: colors.gold }]}>Mozo y juez</Text> quedan pendientes de aprobación:
              el admin los habilita desde su panel antes del primer turno. El jugador entra al instante.
            </Text>
          </View>

          {errorGeneral ? <ErrorBanner mensaje={errorGeneral} /> : null}

          <Button
            label={usuarioSinPerfil ? `Completar como ${ROLE_LABEL[role]}` : `Crear cuenta de ${ROLE_LABEL[role]}`}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 14, paddingBottom: 30 },
  back: { alignSelf: 'flex-start', marginBottom: 16, minHeight: 24, justifyContent: 'center' },
  backText: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  title: { fontFamily: Typography.fontFamily.bold, fontSize: 27, letterSpacing: -0.8 },
  titleGap: { marginBottom: 20 },
  completarTexto: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 18, marginTop: -8, marginBottom: 16 },
  campos: { gap: 12, marginTop: 20 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  noteGap: { marginTop: 16, marginBottom: 18 },
  noteText: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18.4 },
  noteFuerte: { fontFamily: Typography.fontFamily.semibold },
  loginBox: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 10, paddingHorizontal: 8 },
  loginText: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5 },
  loginLink: { fontFamily: Typography.fontFamily.semibold, textDecorationLine: 'underline' },
  listo: { flex: 1, justifyContent: 'center', paddingHorizontal: 26, gap: 18 },
});
