import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { Typography } from '../../constants/theme';
import { ROLE_LABEL, Role, SelectableRole } from '../../constants/roles';
import { normalizarPerfil } from '../../hooks/useUserProfile';
import { codigoError, mensajeError } from '../../lib/errores';
import { advertencia, exito, fallo, tocar } from '../../lib/haptics';
import type { UserProfile } from '../../lib/users';
import RoleSelector from '../../components/RoleSelector';
import FormField from '../../components/FormField';
import Button from '../../components/Button';
import { ErrorBanner } from '../../components/ui';
import { useReiniciarNavegacion } from '../../hooks/useReiniciarNavegacion';

const CLAVE_ULTIMO_PERFIL = 'duel.ultimoPerfil';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVISO_RESET = 'Si hay una cuenta con ese email, te llega un link para cambiar la contraseña.';

interface Errores {
  role?: string;
  email?: string;
  password?: string;
}

function esPerfilGuardado(valor: string | null): valor is Role {
  return valor === 'mozo' || valor === 'juez' || valor === 'jugador' || valor === 'admin';
}

function problemaDeAcceso(perfil: UserProfile | null, pedido: Role): string | null {
  if (!perfil) return 'No encontramos tu perfil. Si te registraste recién, volvé a crear la cuenta o hablá con el admin.';
  if (perfil.estadoAprobacion === 'rechazado') return 'El admin no habilitó esta cuenta.';
  if (perfil.estadoAprobacion !== 'aprobado') {
    return `Tu cuenta de ${ROLE_LABEL[perfil.role]} todavía espera la aprobación del admin. Probá de nuevo cuando te avise que la habilitó.`;
  }
  if (perfil.role === pedido) return null;
  if (perfil.role === 'admin') return 'Es una cuenta de administración: tocá "Entrar con cuenta de administración".';
  if (pedido === 'admin') return `Esta cuenta no es de administración. Elegí el perfil ${ROLE_LABEL[perfil.role]} para entrar.`;
  return `Esta cuenta es de ${ROLE_LABEL[perfil.role]}. Elegí ese perfil para entrar.`;
}

export default function LoginScreen() {
  const router = useRouter();
  const reiniciar = useReiniciarNavegacion();
  const { colors } = useTheme();
  const { mostrar } = useToast();
  const [adminMode, setAdminMode] = useState(false);
  const [role, setRole] = useState<SelectableRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);
  const enCurso = useRef(false);
  const resetEnCurso = useRef(false);
  const eligioPerfil = useRef(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    let activo = true;
    AsyncStorage.getItem(CLAVE_ULTIMO_PERFIL)
      .then((valor) => {
        if (!activo || eligioPerfil.current || !esPerfilGuardado(valor)) return;
        if (valor === 'admin') setAdminMode(true);
        else setRole(valor);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, []);

  const limpiarError = (campo: keyof Errores) => {
    setErrorGeneral(null);
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const volver = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const entrar = async () => {
    if (enCurso.current) return;
    const pedido: Role | null = adminMode ? 'admin' : role;
    const mail = email.trim();
    const nuevos: Errores = {};
    if (!pedido) nuevos.role = 'Elegí tu perfil para seguir.';
    if (!mail) nuevos.email = 'Escribí tu email.';
    else if (!EMAIL_VALIDO.test(mail)) nuevos.email = 'Revisá el email: no parece válido.';
    if (!password) nuevos.password = 'Escribí tu contraseña.';
    setErrores(nuevos);
    setErrorGeneral(null);
    if (!pedido || Object.keys(nuevos).length > 0) {
      advertencia();
      return;
    }

    enCurso.current = true;
    setEnviando(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, mail, password);
      let perfil: UserProfile | null;
      try {
        const snap = await getDoc(doc(db, 'users', cred.user.uid));
        perfil = normalizarPerfil(cred.user.uid, snap.exists() ? snap.data() : undefined);
      } catch (e) {
        await signOut(auth).catch(() => undefined);
        setErrorGeneral(mensajeError(e, 'No pudimos leer tu perfil. Probá de nuevo.'));
        fallo();
        return;
      }
      // Alta a medias o cuenta de la versión anterior: las pestañas guían para completarla en vez de rebotar.
      if (!perfil) {
        exito();
        reiniciar('(tabs)');
        return;
      }
      // Si ya verificó su email, se deja anotado (las reglas lo aceptan solo con el token que lo confirma).
      if (cred.user.emailVerified && !perfil.emailVerificado) {
        await updateDoc(doc(db, 'users', cred.user.uid), { emailVerificado: true }).catch(() => undefined);
      }
      const problema = problemaDeAcceso(perfil, pedido);
      if (problema) {
        await signOut(auth).catch(() => undefined);
        setErrorGeneral(problema);
        fallo();
        return;
      }
      AsyncStorage.setItem(CLAVE_ULTIMO_PERFIL, pedido).catch(() => undefined);
      exito();
      reiniciar('(tabs)');
    } catch (e) {
      if (codigoError(e) === 'auth/invalid-email') setErrores({ email: mensajeError(e) });
      else setErrorGeneral(mensajeError(e, 'No pudimos iniciar sesión. Probá de nuevo.'));
      fallo();
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  };

  const recuperar = async () => {
    if (resetEnCurso.current) return;
    const mail = email.trim();
    if (!EMAIL_VALIDO.test(mail)) {
      setErrores((prev) => ({ ...prev, email: 'Escribí tu email acá y te mandamos un link para cambiar la contraseña.' }));
      advertencia();
      return;
    }
    resetEnCurso.current = true;
    setEnviandoReset(true);
    try {
      await sendPasswordResetEmail(auth, mail);
      mostrar(AVISO_RESET, 'ok');
    } catch (e) {
      const codigo = codigoError(e);
      // Mismo aviso que el éxito: no revelamos si el email tiene cuenta.
      if (codigo === 'auth/user-not-found') mostrar(AVISO_RESET, 'ok');
      else if (codigo === 'auth/invalid-email') setErrores((prev) => ({ ...prev, email: mensajeError(e) }));
      else mostrar(mensajeError(e, 'No pudimos mandar el link. Probá de nuevo.'), 'error');
    } finally {
      resetEnCurso.current = false;
      setEnviandoReset(false);
    }
  };

  const cambiarModo = (admin: boolean) => {
    tocar();
    eligioPerfil.current = true;
    setAdminMode(admin);
    setErrores({});
    setErrorGeneral(null);
  };

  const botonLabel = adminMode ? 'Entrar como Admin' : role ? `Entrar como ${ROLE_LABEL[role]}` : 'Entrar';

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
            Entrar
          </Text>
          <Text style={[styles.subtitle, { color: colors.dim }]}>
            {adminMode ? 'Cuenta de administración del local.' : 'Elegí tu perfil.'}
          </Text>

          {adminMode ? (
            <TouchableOpacity
              onPress={() => cambiarModo(false)}
              style={styles.linkBox}
              disabled={enviando}
              accessibilityRole="button"
              accessibilityLabel="Elegir mi perfil de mozo, juez o jugador"
            >
              <Text style={[styles.linkFuerte, { color: colors.br }]}>← Elegir mi perfil</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <RoleSelector
                value={role}
                onChange={(r) => {
                  eligioPerfil.current = true;
                  setRole(r);
                  limpiarError('role');
                }}
                variant="list"
                disabled={enviando}
              />
              {errores.role ? (
                <Text style={[styles.errorTexto, { color: colors.dg }]} accessibilityLiveRegion="polite">
                  {errores.role}
                </Text>
              ) : null}
            </View>
          )}

          <View style={styles.campos}>
            <FormField
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
            <FormField
              ref={passwordRef}
              label="Contraseña"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                limpiarError('password');
              }}
              error={errores.password}
              placeholder="Tu contraseña"
              secureToggle
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              maxLength={128}
              editable={!enviando}
              onSubmitEditing={() => {
                void entrar();
              }}
            />
          </View>

          <TouchableOpacity
            onPress={() => {
              void recuperar();
            }}
            disabled={enviandoReset || enviando}
            style={styles.olvido}
            accessibilityRole="button"
            accessibilityLabel="Olvidé mi contraseña"
            accessibilityHint="Te manda un email para cambiarla"
            accessibilityState={{ disabled: enviandoReset || enviando, busy: enviandoReset }}
          >
            <Text style={[styles.link, { color: colors.dim }, enviandoReset && styles.apagado]}>
              {enviandoReset ? 'Enviando link…' : '¿Olvidaste tu contraseña?'}
            </Text>
          </TouchableOpacity>

          {errorGeneral ? <ErrorBanner mensaje={errorGeneral} /> : null}

          <Button
            label={botonLabel}
            onPress={() => {
              void entrar();
            }}
            loading={enviando}
          />

          {!adminMode ? (
            <TouchableOpacity
              onPress={() => cambiarModo(true)}
              disabled={enviando}
              style={styles.linkBox}
              accessibilityRole="button"
              accessibilityLabel="Entrar con cuenta de administración"
            >
              <Text style={[styles.link, { color: colors.dim }]}>Entrar con cuenta de administración</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.spacer} />

          {!adminMode ? (
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/register')}
              disabled={enviando}
              style={styles.notaBox}
              accessibilityRole="link"
              accessibilityLabel="¿No tenés cuenta? Registrate"
            >
              <Text style={[styles.nota, { color: colors.dim }]}>
                ¿No tenés cuenta? <Text style={[styles.notaLink, { color: colors.br }]}>Registrate</Text>
              </Text>
            </TouchableOpacity>
          ) : null}
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
  subtitle: { fontFamily: Typography.fontFamily.regular, fontSize: 12.5, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  campos: { gap: 12, marginTop: 20 },
  errorTexto: { fontFamily: Typography.fontFamily.medium, fontSize: 11.5, marginTop: 8, marginLeft: 4 },
  olvido: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginBottom: 6 },
  link: { fontFamily: Typography.fontFamily.medium, fontSize: 11.5, textAlign: 'center', textDecorationLine: 'underline' },
  linkFuerte: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5 },
  apagado: { opacity: 0.6 },
  linkBox: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginTop: 6 },
  spacer: { flexGrow: 1, minHeight: 20 },
  notaBox: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 17.6, textAlign: 'center' },
  notaLink: { fontFamily: Typography.fontFamily.semibold, textDecorationLine: 'underline' },
});
