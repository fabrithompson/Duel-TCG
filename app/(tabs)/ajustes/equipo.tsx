import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen, { LoadingScreen } from '../../../components/Screen';
import Button from '../../../components/Button';
import Avatar from '../../../components/Avatar';
import FormField from '../../../components/FormField';
import RoleSelector from '../../../components/RoleSelector';
import { Badge, Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../../components/ui';
import { ROLE_LABEL, RolEquipo, Role } from '../../../constants/roles';
import { Typography } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { MiembroEquipo, ROLES_STAFF, RolStaff, rolEnTexto, useEquipo } from '../../../hooks/useEquipo';
import { useVolverA } from '../../../hooks/useVolverA';
import JugadoresEquipo from '../../../components/JugadoresEquipo';
import { haceCuanto } from '../../../lib/ajustes';
import { crearCuentaEquipo } from '../../../lib/altaEquipo';
import { codigoError, mensajeError } from '../../../lib/errores';
import { advertencia, exito, fallo, tocar } from '../../../lib/haptics';
import { preguntar } from '../../../lib/dialogo';

type TonoRol = 'br' | 'gold';

// Juez es rol de torneo: va en dorado; admin y mozo son operación del café.
function tonoDeRol(rol: Role): TonoRol {
  return rol === 'juez' ? 'gold' : 'br';
}

export default function EquipoScreen() {
  const { profile, loading } = useUserProfileContext();
  const volver = useVolverA('/(tabs)/ajustes');

  if (loading) return <LoadingScreen />;

  if (profile?.role !== 'admin' || profile.estadoAprobacion !== 'aprobado') {
    return (
      <Screen back="Ajustes" onBack={volver} title="Equipo">
        <EmptyState
          title="Solo el admin entra acá"
          body="Las cuentas del equipo y los cambios de rol los maneja la cuenta de administración."
        />
      </Screen>
    );
  }

  return <EquipoAdmin />;
}

function EquipoAdmin() {
  const { colors } = useTheme();
  const volver = useVolverA('/(tabs)/ajustes');
  const equipo = useEquipo();
  const [verSinAcceso, setVerSinAcceso] = useState(false);
  const { pendientes, activos, rechazados, miUid, estaOcupado } = equipo;

  const confirmarRechazo = (m: MiembroEquipo) => {
    preguntar(`¿Rechazar a ${m.nombre}?`, 'No va a poder entrar a la app. Si fue un error, lo reactivás desde "Sin acceso".', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => void equipo.rechazar(m) },
    ]);
  };

  const confirmarQuitarAcceso = (m: MiembroEquipo) => {
    preguntar(`¿Quitarle el acceso a ${m.nombre}?`, 'No va a poder entrar a la app hasta que lo reactives desde "Sin acceso".', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar acceso', style: 'destructive', onPress: () => void equipo.quitarAcceso(m) },
    ]);
  };

  const confirmarAdmin = (m: MiembroEquipo) => {
    preguntar(
      `¿Hacer admin a ${m.nombre}?`,
      'Va a poder cambiar los ajustes del local, ver la caja, cargar mercadería y sumar o quitar gente del equipo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Hacer admin', style: 'destructive', onPress: () => void equipo.cambiarRol(m, 'admin') },
      ]
    );
  };

  const pasarA = (m: MiembroEquipo, rol: RolStaff) => {
    if (rol === 'admin') confirmarAdmin(m);
    else void equipo.cambiarRol(m, rol);
  };

  // Android muestra como mucho tres botones por Alert: por eso el cambio de rol va en un segundo paso.
  const elegirRol = (m: MiembroEquipo) => {
    const otros = ROLES_STAFF.filter((r) => r !== m.role);
    preguntar(`Cambiar el rol de ${m.nombre}`, `Hoy es ${rolEnTexto(m.role)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      ...otros.slice(0, 2).map((rol) => ({ text: `Pasar a ${ROLE_LABEL[rol]}`, onPress: () => pasarA(m, rol) })),
    ]);
  };

  const abrirOpciones = (m: MiembroEquipo) => {
    if (m.uid === miUid) return;
    preguntar(m.nombre, m.email ? `${ROLE_LABEL[m.role]} · ${m.email}` : ROLE_LABEL[m.role], [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar acceso', style: 'destructive', onPress: () => confirmarQuitarAcceso(m) },
      { text: 'Cambiar rol', onPress: () => elegirRol(m) },
    ]);
  };

  const sinNadieMas = !equipo.cargando && pendientes.length === 0 && rechazados.length === 0 && activos.every((m) => m.uid === miUid);

  return (
    <Screen back="Ajustes" onBack={volver} title="Equipo" keyboard>
      <View style={styles.contenido}>
        {miUid ? <SumarAlEquipo adminUid={miUid} buscarPorEmail={equipo.buscarPorEmail} cambiarRol={equipo.cambiarRol} /> : null}

        {equipo.error ? (
          <ErrorBanner mensaje={mensajeError(equipo.error, 'No se pudo cargar el equipo.')} onRetry={equipo.reintentar} />
        ) : null}

        {equipo.cargando ? (
          <View style={styles.cargando}>
            <ActivityIndicator color={colors.br} accessibilityLabel="Cargando el equipo" />
          </View>
        ) : (
          <>
            {pendientes.length > 0 ? (
              <View>
                <SectionLabel tone="br">Esperando aprobación</SectionLabel>
                <View style={styles.lista}>
                  {pendientes.map((m) => (
                    <Solicitud
                      key={m.uid}
                      miembro={m}
                      ocupado={estaOcupado(m.uid)}
                      onAprobar={() => void equipo.aprobar(m)}
                      onRechazar={() => confirmarRechazo(m)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {sinNadieMas && !equipo.error ? (
              <EmptyState title="Todavía no hay mozos ni jueces" />
            ) : null}

            {activos.length > 0 ? (
              <View>
                <SectionLabel>{`Activos · ${activos.length}`}</SectionLabel>
                {activos.map((m) => (
                  <FilaMiembro
                    key={m.uid}
                    miembro={m}
                    esYo={m.uid === miUid}
                    ocupado={estaOcupado(m.uid)}
                    onPress={() => abrirOpciones(m)}
                  />
                ))}
              </View>
            ) : null}

            {rechazados.length > 0 ? (
              <View>
                <TouchableOpacity
                  style={styles.plegable}
                  onPress={() => {
                    tocar();
                    setVerSinAcceso((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sin acceso, ${rechazados.length} ${rechazados.length === 1 ? 'persona' : 'personas'}`}
                  accessibilityState={{ expanded: verSinAcceso }}
                >
                  <SectionLabel right={<Ionicons name={verSinAcceso ? 'chevron-up' : 'chevron-down'} size={16} color={colors.dim} />}>
                    {`Sin acceso · ${rechazados.length}`}
                  </SectionLabel>
                </TouchableOpacity>
                {verSinAcceso
                  ? rechazados.map((m) => (
                      <FilaSinAcceso key={m.uid} miembro={m} ocupado={estaOcupado(m.uid)} onReactivar={() => void equipo.reactivar(m)} />
                    ))
                  : null}
              </View>
            ) : null}
          </>
        )}

        <JugadoresEquipo />
      </View>
    </Screen>
  );
}

// ─── Sumar al equipo ───────────────────────────────────────────────────────

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE = { min: 2, max: 60 };
const PASSWORD_MIN = 8;

interface ErroresAlta {
  nombre?: string;
  email?: string;
  password?: string;
}

interface SumarAlEquipoProps {
  readonly adminUid: string;
  readonly buscarPorEmail: (email: string) => Promise<MiembroEquipo | null>;
  readonly cambiarRol: (m: MiembroEquipo, rol: RolStaff) => Promise<boolean>;
}

// El admin crea la cuenta de cada mozo o juez y le pasa el email y la contraseña (la cambia en Mi cuenta).
function SumarAlEquipo({ adminUid, buscarPorEmail, cambiarRol }: SumarAlEquipoProps) {
  const { mostrar } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [role, setRole] = useState<RolEquipo>('mozo');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [creando, setCreando] = useState(false);
  const enCurso = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const limpiarError = (campo: keyof ErroresAlta) => {
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const cerrar = () => {
    setAbierto(false);
    setNombre('');
    setEmail('');
    setPassword('');
    setErrores({});
  };

  // El email ya tiene cuenta: si es de un jugador, se ofrece pasarlo al equipo con esa misma cuenta.
  const emailEnUso = async (mail: string) => {
    const existente = await buscarPorEmail(mail).catch(() => null);
    if (existente?.role !== 'jugador') {
      setErrores({ email: existente ? `Ya está en el equipo como ${rolEnTexto(existente.role)}.` : 'Ya existe una cuenta con ese email.' });
      fallo();
      return;
    }
    preguntar(`${existente.nombre} ya tiene cuenta de jugador`, `¿Pasarlo a ${rolEnTexto(role)}? Entra con su contraseña de siempre.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: `Pasar a ${ROLE_LABEL[role]}`,
        onPress: () =>
          void cambiarRol(existente, role).then((ok) => {
            if (ok) cerrar();
          }),
      },
    ]);
  };

  const crear = async () => {
    if (enCurso.current) return;
    const nombreLimpio = nombre.trim().replace(/\s+/g, ' ');
    const mail = email.trim().toLowerCase();
    const nuevos: ErroresAlta = {};
    if (nombreLimpio.length < NOMBRE.min || nombreLimpio.length > NOMBRE.max) {
      nuevos.nombre = `Escribí el nombre (entre ${NOMBRE.min} y ${NOMBRE.max} caracteres).`;
    }
    if (!mail) nuevos.email = 'Escribí el email.';
    else if (!EMAIL_VALIDO.test(mail)) nuevos.email = 'Revisá el email: no parece válido.';
    if (password.length < PASSWORD_MIN) nuevos.password = `Usá al menos ${PASSWORD_MIN} caracteres.`;
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      advertencia();
      return;
    }

    enCurso.current = true;
    setCreando(true);
    try {
      await crearCuentaEquipo({ nombre: nombreLimpio, email: mail, password, role }, adminUid);
      exito();
      mostrar(`${nombreLimpio} ya puede entrar como ${rolEnTexto(role)}`, 'ok');
      cerrar();
    } catch (e) {
      const c = codigoError(e);
      if (c === 'auth/email-already-in-use') {
        await emailEnUso(mail);
      } else if (c === 'auth/invalid-email') {
        setErrores({ email: mensajeError(e) });
        fallo();
      } else if (c === 'auth/weak-password') {
        setErrores({ password: mensajeError(e) });
        fallo();
      } else {
        mostrar(mensajeError(e, 'No se pudo crear la cuenta. Probá de nuevo.'), 'error');
        fallo();
      }
    } finally {
      enCurso.current = false;
      setCreando(false);
    }
  };

  if (!abierto) return <Button label="Sumar al equipo" onPress={() => setAbierto(true)} />;

  return (
    <Card>
      <View style={styles.alta}>
        <RoleSelector value={role} onChange={setRole} disabled={creando} />
        <FormField
          label="Nombre y apellido"
          autoFocus
          value={nombre}
          onChangeText={(t) => {
            setNombre(t);
            limpiarError('nombre');
          }}
          error={errores.nombre}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="next"
          maxLength={NOMBRE.max}
          editable={!creando}
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />
        {/* Sin autocompletar: el teléfono es del admin y sugeriría su propio email y contraseña. */}
        <FormField
          ref={emailRef}
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            limpiarError('email');
          }}
          error={errores.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          returnKeyType="next"
          maxLength={254}
          editable={!creando}
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
          placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          returnKeyType="go"
          maxLength={128}
          editable={!creando}
          onSubmitEditing={() => {
            void crear();
          }}
        />
        <View style={styles.botones}>
          <View style={styles.botonChico}>
            <Button label="Cancelar" variant="secondary" onPress={cerrar} disabled={creando} />
          </View>
          <View style={styles.botonGrande}>
            <Button
              label={`Crear cuenta de ${ROLE_LABEL[role]}`}
              onPress={() => {
                void crear();
              }}
              loading={creando}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

// ─── Filas ─────────────────────────────────────────────────────────────────

function AvatarMiembro({ fotoUrl, tono, grande = false }: { readonly fotoUrl: string | null; readonly tono: TonoRol | 'dim'; readonly grande?: boolean }) {
  const { colors } = useTheme();
  return <Avatar fotoUrl={fotoUrl} tamano={grande ? 34 : 32} borde={colors[tono]} radio={grande ? 11 : 10} />;
}

interface SolicitudProps {
  readonly miembro: MiembroEquipo;
  readonly ocupado: boolean;
  readonly onAprobar: () => void;
  readonly onRechazar: () => void;
}

function Solicitud({ miembro, ocupado, onAprobar, onRechazar }: SolicitudProps) {
  const { colors } = useTheme();
  const rol = rolEnTexto(miembro.role);
  const cuando = haceCuanto(miembro.creadoEnMs);

  return (
    <View style={[styles.solicitud, { borderColor: colors.br, backgroundColor: colors.brs }]}>
      <View style={styles.solicitudFila}>
        <AvatarMiembro fotoUrl={miembro.fotoUrl} tono="br" grande />
        <View style={styles.flex1}>
          <Text style={[styles.solicitudNombre, { color: colors.ink }]}>{miembro.nombre}</Text>
          <Text style={[styles.sub, { color: colors.dim }]}>{`Pide entrar como ${rol}${cuando ? ` · ${cuando}` : ''}`}</Text>
          {miembro.email ? (
            <Text style={[styles.sub, { color: colors.dim }]} numberOfLines={1}>
              {miembro.email}
            </Text>
          ) : null}
          <Text style={[styles.sub, { color: miembro.emailVerificado ? colors.ok : colors.dim }]}>
            {miembro.emailVerificado ? 'Email verificado' : 'Email sin verificar'}
          </Text>
        </View>
      </View>
      <View style={styles.botones}>
        <View style={styles.botonChico}>
          <Button label="Rechazar" variant="secondary" onPress={onRechazar} disabled={ocupado} />
        </View>
        <View style={styles.botonGrande}>
          <Button label={`Aprobar como ${rol}`} onPress={onAprobar} loading={ocupado} />
        </View>
      </View>
    </View>
  );
}

interface FilaMiembroProps {
  readonly miembro: MiembroEquipo;
  readonly esYo: boolean;
  readonly ocupado: boolean;
  readonly onPress: () => void;
}

function FilaMiembro({ miembro, esYo, ocupado, onPress }: FilaMiembroProps) {
  const { colors } = useTheme();
  const tono = tonoDeRol(miembro.role);
  const bloqueado = esYo || ocupado;
  const detalle = esYo ? 'Sos vos' : miembro.email || 'Sin email';

  return (
    <TouchableOpacity
      style={[styles.miembro, { borderBottomColor: colors.line }]}
      onPress={() => {
        tocar();
        onPress();
      }}
      disabled={bloqueado}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${miembro.nombre}, ${ROLE_LABEL[miembro.role]}. ${detalle}`}
      accessibilityHint={esYo ? undefined : 'Cambiar el rol o quitar el acceso'}
      accessibilityState={{ disabled: bloqueado, busy: ocupado }}
    >
      <AvatarMiembro fotoUrl={miembro.fotoUrl} tono={tono} />
      <View style={styles.flex1}>
        <Text style={[styles.miembroNombre, { color: colors.ink }]}>{miembro.nombre}</Text>
        <Text style={[styles.sub, { color: colors.dim }]} numberOfLines={1}>
          {detalle}
        </Text>
      </View>
      {ocupado ? <ActivityIndicator size="small" color={colors.dim} /> : <Badge label={ROLE_LABEL[miembro.role]} tone={tono} />}
    </TouchableOpacity>
  );
}

interface FilaSinAccesoProps {
  readonly miembro: MiembroEquipo;
  readonly ocupado: boolean;
  readonly onReactivar: () => void;
}

function FilaSinAcceso({ miembro, ocupado, onReactivar }: FilaSinAccesoProps) {
  const { colors } = useTheme();
  const detalle = miembro.email ? `${ROLE_LABEL[miembro.role]} · ${miembro.email}` : ROLE_LABEL[miembro.role];
  return (
    <View style={[styles.miembro, { borderBottomColor: colors.line }]}>
      <AvatarMiembro fotoUrl={miembro.fotoUrl} tono="dim" />
      <View style={styles.flex1}>
        <Text style={[styles.miembroNombre, { color: colors.ink }]}>{miembro.nombre}</Text>
        <Text style={[styles.sub, { color: colors.dim }]} numberOfLines={1}>
          {detalle}
        </Text>
      </View>
      {ocupado ? <ActivityIndicator size="small" color={colors.dim} /> : <SmallButton label="Reactivar" onPress={onReactivar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  contenido: { gap: 18 },
  cargando: { paddingVertical: 24, alignItems: 'center' },
  lista: { gap: 9 },

  alta: { gap: 12 },

  solicitud: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 12 },
  solicitudFila: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  solicitudNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  botones: { flexDirection: 'row', gap: 8 },
  botonChico: { flex: 1 },
  botonGrande: { flex: 1.6 },

  miembro: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, minHeight: 56 },
  miembroNombre: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },


  plegable: { minHeight: 44, justifyContent: 'center' },
});
