import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen, { LoadingScreen } from '../../../components/Screen';
import Button from '../../../components/Button';
import { Badge, Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../../components/ui';
import { ROLE_LABEL, Role } from '../../../constants/roles';
import { Typography, tabularNums } from '../../../constants/theme';
import { useConfig } from '../../../contexts/ConfigContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { useConfigPrivada } from '../../../hooks/useConfigPrivada';
import { MiembroEquipo, ROLES_STAFF, RolStaff, rolEnTexto, useEquipo } from '../../../hooks/useEquipo';
import { useVolverA } from '../../../hooks/useVolverA';
import { fechaConAnio, haceCuanto, inicialDe } from '../../../lib/ajustes';
import { fechaLocal } from '../../../lib/fecha';
import { mensajeError } from '../../../lib/errores';
import { tocar } from '../../../lib/haptics';

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
          body="Las aprobaciones de cuentas y los cambios de rol los hace la cuenta de administración."
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
    Alert.alert(`¿Rechazar a ${m.nombre}?`, 'No va a poder entrar a la app. Si fue un error, lo reactivás desde "Sin acceso".', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Rechazar', style: 'destructive', onPress: () => void equipo.rechazar(m) },
    ]);
  };

  const confirmarQuitarAcceso = (m: MiembroEquipo) => {
    Alert.alert(`¿Quitarle el acceso a ${m.nombre}?`, 'No va a poder entrar a la app hasta que lo reactives desde "Sin acceso".', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar acceso', style: 'destructive', onPress: () => void equipo.quitarAcceso(m) },
    ]);
  };

  const confirmarAdmin = (m: MiembroEquipo) => {
    Alert.alert(
      `¿Hacer admin a ${m.nombre}?`,
      'Va a poder cambiar los ajustes del local, ver la caja, cargar mercadería y aprobar o quitar gente del equipo.',
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
    Alert.alert(`Cambiar el rol de ${m.nombre}`, `Hoy es ${rolEnTexto(m.role)}.`, [
      { text: 'Cancelar', style: 'cancel' },
      ...otros.slice(0, 2).map((rol) => ({ text: `Pasar a ${ROLE_LABEL[rol]}`, onPress: () => pasarA(m, rol) })),
    ]);
  };

  const abrirOpciones = (m: MiembroEquipo) => {
    if (m.uid === miUid) return;
    Alert.alert(m.nombre, m.email ? `${ROLE_LABEL[m.role]} · ${m.email}` : ROLE_LABEL[m.role], [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar acceso', style: 'destructive', onPress: () => confirmarQuitarAcceso(m) },
      { text: 'Cambiar rol', onPress: () => elegirRol(m) },
    ]);
  };

  const sinNadieMas = !equipo.cargando && pendientes.length === 0 && rechazados.length === 0 && activos.every((m) => m.uid === miUid);

  return (
    <Screen back="Ajustes" onBack={volver} title="Equipo" subtitle="Quién entra, con qué perfil y qué puede tocar.">
      <View style={styles.contenido}>
        <CodigoInvitacion />

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
              <EmptyState
                title="Todavía no hay mozos ni jueces"
                body="Generá un código de invitación y compartilo. Cuando alguien se registre, aparece acá para que lo apruebes."
              />
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

        <Text style={[styles.nota, { color: colors.dim }]}>
          Tocá a alguien del equipo para cambiarle el rol o quitarle el acceso. Los jugadores no necesitan aprobación: entran solos y el juez
          los suma al torneo.
        </Text>
      </View>
    </Screen>
  );
}

// ─── Código de invitación ──────────────────────────────────────────────────

function CodigoInvitacion() {
  const { colors } = useTheme();
  const { config } = useConfig();
  const { mostrar } = useToast();
  const privada = useConfigPrivada(true);
  const compartiendo = useRef(false);
  const codigo = privada.config.codigoInvitacion;
  const venceMs = privada.config.codigoVenceMs;
  const vencido = venceMs !== null && venceMs <= Date.now();

  const generar = () => {
    if (!codigo) {
      void privada.generarCodigo();
      return;
    }
    Alert.alert('¿Generar un código nuevo?', 'El código actual deja de servir. Quien todavía no se registró va a necesitar el nuevo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Generar', style: 'destructive', onPress: () => void privada.generarCodigo() },
    ]);
  };

  const compartir = async () => {
    if (!codigo || compartiendo.current) return;
    compartiendo.current = true;
    try {
      await Share.share({ message: `Código para registrarte en ${config.nombreLocal}: ${codigo}` });
    } catch {
      mostrar('No se pudo abrir el menú para compartir.', 'error');
    } finally {
      compartiendo.current = false;
    }
  };

  let cuerpo: React.ReactNode;
  if (privada.cargando) {
    cuerpo = <ActivityIndicator color={colors.br} accessibilityLabel="Cargando el código" />;
  } else if (privada.error) {
    cuerpo = <ErrorBanner mensaje={mensajeError(privada.error, 'No se pudo leer el código de invitación.')} onRetry={privada.reintentar} />;
  } else {
    cuerpo = (
      <>
        {codigo ? (
          <View style={styles.codigoBloque}>
            <Text
              style={[styles.codigo, { color: colors.ink }, tabularNums(30), styles.codigoEspaciado]}
              selectable
              accessibilityLabel={`Código ${codigo.split('').join(' ')}`}
            >
              {codigo}
            </Text>
            <Text style={[styles.codigoSub, { color: colors.dim }]}>
              Mozos y jueces lo escriben al crear su cuenta. Los jugadores no lo necesitan.
            </Text>
            {venceMs !== null ? (
              <Text style={[styles.codigoSub, { color: vencido ? colors.dg : colors.dim }]}>
                {vencido ? 'Venció: generá uno nuevo para sumar a alguien.' : `Sirve hasta el ${fechaConAnio(fechaLocal(new Date(venceMs)))}.`}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.sinCodigo, { color: colors.dim }]}>Sin código: mozo y juez no pueden registrarse todavía.</Text>
        )}
        <View style={styles.codigoAcciones}>
          {codigo && !vencido ? <Button label="Compartir" onPress={() => void compartir()} /> : null}
          <Button
            label="Generar código nuevo"
            variant={codigo && !vencido ? 'secondary' : 'primary'}
            onPress={generar}
            loading={privada.generando}
          />
        </View>
      </>
    );
  }

  return (
    <View>
      <SectionLabel>Código de invitación</SectionLabel>
      <Card>{cuerpo}</Card>
    </View>
  );
}

// ─── Filas ─────────────────────────────────────────────────────────────────

function Avatar({ nombre, tono, grande = false }: { readonly nombre: string; readonly tono: TonoRol | 'dim'; readonly grande?: boolean }) {
  const { colors } = useTheme();
  const color = colors[tono];
  return (
    <View
      style={[styles.avatar, grande ? styles.avatarGrande : null, { borderColor: color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarTexto, grande ? styles.avatarTextoGrande : null, { color }]}>{inicialDe(nombre)}</Text>
    </View>
  );
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
        <Avatar nombre={miembro.nombre} tono="br" grande />
        <View style={styles.flex1}>
          <Text style={[styles.solicitudNombre, { color: colors.ink }]}>{miembro.nombre}</Text>
          <Text style={[styles.sub, { color: colors.dim }]}>{`Pide entrar como ${rol}${cuando ? ` · ${cuando}` : ''}`}</Text>
          {miembro.email ? (
            <Text style={[styles.sub, { color: colors.dim }]} numberOfLines={1}>
              {miembro.email}
            </Text>
          ) : null}
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
  const detalle = esYo ? 'Sos vos · tu cuenta no se cambia desde acá' : miembro.email || 'Sin email';

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
      <Avatar nombre={miembro.nombre} tono={tono} />
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
      <Avatar nombre={miembro.nombre} tono="dim" />
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
  nota: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18 },

  codigoBloque: { gap: 6 },
  codigo: { fontFamily: Typography.fontFamily.semibold, fontSize: 30 },
  codigoEspaciado: { letterSpacing: 3 },
  codigoSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 17 },
  sinCodigo: { fontFamily: Typography.fontFamily.medium, fontSize: 13, lineHeight: 19 },
  codigoAcciones: { gap: 8, marginTop: 14 },

  solicitud: { borderWidth: 1.5, borderRadius: 14, padding: 14, gap: 12 },
  solicitudFila: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  solicitudNombre: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  botones: { flexDirection: 'row', gap: 8 },
  botonChico: { flex: 1 },
  botonGrande: { flex: 1.6 },

  miembro: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, minHeight: 56 },
  miembroNombre: { fontFamily: Typography.fontFamily.medium, fontSize: 13.5 },
  sub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },

  avatar: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarGrande: { width: 34, height: 34, borderRadius: 11 },
  avatarTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  avatarTextoGrande: { fontSize: 13 },

  plegable: { minHeight: 44, justifyContent: 'center' },
});
