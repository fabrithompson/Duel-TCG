import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Screen, { LoadingScreen } from '../../../components/Screen';
import Button from '../../../components/Button';
import Chip from '../../../components/Chip';
import FormField from '../../../components/FormField';
import Stepper from '../../../components/Stepper';
import { Badge, Card, EmptyState, ErrorBanner, SectionLabel, SmallButton } from '../../../components/ui';
import { BRAND_COLORS, BrandColor, Radii, Typography, tabularNums } from '../../../constants/theme';
import { useConfig } from '../../../contexts/ConfigContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUserProfileContext } from '../../../contexts/UserProfileContext';
import { useEquipo } from '../../../hooks/useEquipo';
import {
  LARGO_NOMBRE_LOCAL,
  LARGO_NOMBRE_TEMPORADA,
  LARGO_NOMBRE_TURNO,
  MAX_TURNOS,
  MIN_TURNOS,
  cruzaMedianoche,
  errorNombre,
  fechaConAnio,
  limpiarTexto,
  normalizarHora,
  pasoSiguiente,
  validarTurnos,
} from '../../../lib/ajustes';
import { ConfigLocal, DefaultsTorneo, LIMITES, Turno } from '../../../lib/config';
import { mensajeError } from '../../../lib/errores';
import { fechaLocal } from '../../../lib/fecha';
import { advertencia, tocar } from '../../../lib/haptics';
import { borrarLogo, mensajeErrorLogo, subirLogo } from '../../../lib/logo';
import { formatARS } from '../../../lib/pedido';

const MARCA_DIA = require('../../../assets/brand/duel-mark.png');
const MARCA_NOCHE = require('../../../assets/brand/duel-mark-dark.png');

const EJEMPLOS_TURNO = ['Mañana', 'Tarde', 'Noche', 'Trasnoche'];

// Espera antes de guardar un stepper: tocar "+" cinco veces escribe una vez y avisa una vez.
const ESPERA_STEPPER_MS = 600;

const NOMBRE_COLOR: Record<BrandColor, string> = {
  '#C2703A': 'terracota',
  '#B68235': 'mostaza',
  '#7A5C3E': 'café',
  '#3F6B58': 'verde',
  '#8A3B4C': 'bordó',
};

export default function AjustesScreen() {
  const { profile, loading } = useUserProfileContext();
  const { cargando } = useConfig();

  if (loading || cargando) return <LoadingScreen />;

  if (profile?.role !== 'admin' || profile.estadoAprobacion !== 'aprobado') {
    return (
      <Screen title="Ajustes del local">
        <EmptyState
          title="Solo el admin entra acá"
          body="Los ajustes del local los cambia la cuenta de administración. Si necesitás cambiar algo, pedíselo al admin."
        />
      </Screen>
    );
  }

  return <AjustesAdmin />;
}

function AjustesAdmin() {
  const { colors } = useTheme();
  const { error, reintentar } = useConfig();
  return (
    <Screen
      title="Ajustes del local"
      subtitle="Todo lo que cambia de un local a otro se define acá. El resto de la app se acomoda sola."
      keyboard
    >
      <View style={styles.contenido}>
        {error ? (
          <ErrorBanner
            mensaje={`${mensajeError(error, 'No pudimos leer los ajustes guardados.')} Lo que ves son los valores por defecto: si guardás, los pisás.`}
            onRetry={reintentar}
          />
        ) : null}
        <Identidad />
        <ColorMarca />
        <Apariencia />
        <Turnos />
        <Stock />
        <Torneos />
        <Cobro />
        <Temporada />
        <AccesoEquipo />
        <Text style={[styles.notaPie, { color: colors.dim }]}>
          El plano de salas y mesas se edita desde Salón (mantené apretada una sala o una mesa).
        </Text>
      </View>
    </Screen>
  );
}

function useGuardarConfig() {
  const { guardarConfig } = useConfig();
  const { mostrar } = useToast();
  return useCallback(
    async (cambios: Partial<ConfigLocal>, aviso = 'Guardado'): Promise<boolean> => {
      try {
        await guardarConfig(cambios);
        mostrar(aviso, 'ok');
        return true;
      } catch (e) {
        mostrar(mensajeError(e, 'No se pudo guardar. Probá de nuevo.'), 'error');
        return false;
      }
    },
    [guardarConfig, mostrar]
  );
}

// ─── Piezas de fila ────────────────────────────────────────────────────────

function Grupo({ titulo, sub, children }: { readonly titulo: string; readonly sub?: string; readonly children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.grupo, { borderColor: colors.line, backgroundColor: colors.sf }]}>
      <View style={styles.grupoCabeza}>
        <Text style={[styles.grupoTitulo, { color: colors.ink }]} accessibilityRole="header">
          {titulo}
        </Text>
        {sub ? <Text style={[styles.grupoSub, { color: colors.dim }]}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Fila({ label, sub, children }: { readonly label: string; readonly sub?: string; readonly children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.fila, { borderTopColor: colors.line }]}>
      <View style={styles.filaTextos}>
        <Text style={[styles.filaLabel, { color: colors.ink }]}>{label}</Text>
        {sub ? <Text style={[styles.filaSub, { color: colors.dim }]}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface FilaToggleProps {
  readonly label: string;
  readonly sub?: string;
  readonly value: boolean;
  readonly onChange: (v: boolean) => void;
}

function FilaToggle({ label, sub, value, onChange }: FilaToggleProps) {
  const { colors } = useTheme();
  return (
    <Fila label={label} sub={sub}>
      <Switch
        value={value}
        onValueChange={(v) => {
          tocar();
          onChange(v);
        }}
        trackColor={{ false: colors.line, true: colors.br }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.line}
        accessibilityLabel={label}
        accessibilityHint={sub}
      />
    </Fila>
  );
}

interface FilaNumeroProps {
  readonly label: string;
  readonly sub?: string;
  readonly valor: number;
  readonly lim: { readonly min: number; readonly max: number };
  readonly paso?: number;
  readonly formato?: (n: number) => string;
  readonly onGuardar: (n: number) => Promise<boolean>;
}

function FilaNumero({ label, sub, valor, lim, paso = 1, formato, onGuardar }: FilaNumeroProps) {
  const [borrador, setBorrador] = useState<number | null>(null);
  const pendiente = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarRef = useRef(onGuardar);
  const valorRef = useRef(valor);

  useEffect(() => {
    guardarRef.current = onGuardar;
    valorRef.current = valor;
  }, [onGuardar, valor]);

  const confirmar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = pendiente.current;
    pendiente.current = null;
    if (v === null) return;
    if (v === valorRef.current) {
      setBorrador(null);
      return;
    }
    void guardarRef.current(v).finally(() => {
      if (pendiente.current === null) setBorrador(null);
    });
  }, []);

  // Al salir de la pantalla con un cambio sin guardar, se guarda igual.
  useEffect(() => confirmar, [confirmar]);

  const mostrado = borrador ?? valor;

  const cambiar = (direccion: 1 | -1) => {
    const siguiente = pasoSiguiente(mostrado, paso, direccion, lim);
    if (siguiente === mostrado) return;
    setBorrador(siguiente);
    pendiente.current = siguiente;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(confirmar, ESPERA_STEPPER_MS);
  };

  return (
    <Fila label={label} sub={sub}>
      <Stepper
        value={mostrado}
        min={lim.min}
        max={lim.max}
        formatValue={formato}
        onIncrement={() => cambiar(1)}
        onDecrement={() => cambiar(-1)}
        accessibilityLabel={label}
      />
    </Fila>
  );
}

function BotonesEdicion({
  onCancelar,
  onGuardar,
  guardando,
  cancelarLabel = 'Cancelar',
  guardarLabel = 'Guardar',
}: {
  readonly onCancelar: () => void;
  readonly onGuardar: () => void;
  readonly guardando: boolean;
  readonly cancelarLabel?: string;
  readonly guardarLabel?: string;
}) {
  return (
    <View style={styles.botones}>
      <View style={styles.botonChico}>
        <Button label={cancelarLabel} variant="secondary" onPress={onCancelar} disabled={guardando} />
      </View>
      <View style={styles.botonGrande}>
        <Button label={guardarLabel} onPress={onGuardar} loading={guardando} />
      </View>
    </View>
  );
}

function MensajeError({ texto }: { readonly texto: string | null }) {
  const { colors } = useTheme();
  if (!texto) return null;
  return (
    <Text style={[styles.error, { color: colors.dg }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {texto}
    </Text>
  );
}

// ─── 1. Identidad ──────────────────────────────────────────────────────────

function Identidad() {
  const { config, guardarConfig } = useConfig();
  const { colors, mode } = useTheme();
  const { mostrar } = useToast();
  const guardar = useGuardarConfig();

  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(config.nombreLocal);
  const [errorNombreLocal, setErrorNombreLocal] = useState<string | null>(null);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [logoOcupado, setLogoOcupado] = useState(false);
  const logoOcupadoRef = useRef(false);
  const [urlFallida, setUrlFallida] = useState<string | null>(null);

  const empezarEdicion = () => {
    setNombre(config.nombreLocal);
    setErrorNombreLocal(null);
    setEditando(true);
  };

  const guardarNombre = async () => {
    if (guardandoNombre) return;
    const error = errorNombre(nombre, LARGO_NOMBRE_LOCAL, 'el nombre del local');
    if (error) {
      advertencia();
      setErrorNombreLocal(error);
      return;
    }
    const limpio = limpiarTexto(nombre);
    if (limpio === config.nombreLocal) {
      setEditando(false);
      return;
    }
    setGuardandoNombre(true);
    const ok = await guardar({ nombreLocal: limpio }, 'Nombre del local guardado');
    setGuardandoNombre(false);
    if (ok) setEditando(false);
  };

  const liberarLogo = () => {
    logoOcupadoRef.current = false;
    setLogoOcupado(false);
  };

  const avisarSinPermiso = (puedePreguntar: boolean) => {
    if (puedePreguntar) {
      mostrar('Sin acceso a tus fotos no se puede cambiar el logo.', 'error');
      return;
    }
    Alert.alert('Sin acceso a tus fotos', 'Para cambiar el logo, habilitá el acceso a las fotos en los ajustes del teléfono.', [
      { text: 'Ahora no', style: 'cancel' },
      {
        text: 'Abrir ajustes',
        onPress: () => {
          Linking.openSettings().catch(() => mostrar('No se pudieron abrir los ajustes del teléfono.', 'error'));
        },
      },
    ]);
  };

  const elegirLogo = async () => {
    if (logoOcupadoRef.current) return;
    logoOcupadoRef.current = true;
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        avisarSinPermiso(permiso.canAskAgain);
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (resultado.canceled || resultado.assets.length === 0) return;
      setLogoOcupado(true);
      const anterior = config.logoUrl;
      const url = await subirLogo(resultado.assets[0].uri);
      try {
        await guardarConfig({ logoUrl: url });
      } catch (e) {
        void borrarLogo(url);
        throw e;
      }
      mostrar('Logo actualizado', 'ok');
      if (anterior) void borrarLogo(anterior);
    } catch (e) {
      mostrar(mensajeErrorLogo(e), 'error');
    } finally {
      liberarLogo();
    }
  };

  const volverAlLogoDeDuel = async () => {
    if (logoOcupadoRef.current) return;
    const anterior = config.logoUrl;
    logoOcupadoRef.current = true;
    setLogoOcupado(true);
    const ok = await guardar({ logoUrl: null }, 'Volviste al logo de Duel');
    liberarLogo();
    if (ok && anterior) void borrarLogo(anterior);
  };

  const tocarLogo = () => {
    if (!config.logoUrl) {
      void elegirLogo();
      return;
    }
    Alert.alert('Logo del local', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Volver al de Duel', style: 'destructive', onPress: () => void volverAlLogoDeDuel() },
      { text: 'Cambiar logo', onPress: () => void elegirLogo() },
    ]);
  };

  const logoPropio = config.logoUrl && config.logoUrl !== urlFallida ? config.logoUrl : null;
  const subtitulo = logoOcupado
    ? 'Actualizando el logo…'
    : !config.logoUrl
      ? 'Logo de Duel · tocá para cargar el tuyo'
      : logoPropio
        ? 'Logo cargado · tocá para cambiarlo'
        : 'No se pudo mostrar el logo · tocá para cambiarlo';

  return (
    <View style={[styles.identidad, { borderColor: colors.line, backgroundColor: colors.sf }]}>
      <View style={styles.identidadFila}>
        <TouchableOpacity
          style={styles.identidadToque}
          onPress={() => {
            tocar();
            tocarLogo();
          }}
          disabled={logoOcupado}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar logo de ${config.nombreLocal}`}
          accessibilityHint={subtitulo}
          accessibilityState={{ disabled: logoOcupado, busy: logoOcupado }}
        >
          <View style={[styles.logoCaja, { borderColor: colors.line, backgroundColor: colors.shade }]}>
            {logoOcupado ? (
              <ActivityIndicator color={colors.br} />
            ) : logoPropio ? (
              <Image
                source={{ uri: logoPropio }}
                style={styles.logoPropio}
                resizeMode="cover"
                onError={() => setUrlFallida(logoPropio)}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Image source={mode === 'night' ? MARCA_NOCHE : MARCA_DIA} style={styles.logoMarca} resizeMode="contain" />
            )}
          </View>
          <View style={styles.identidadTextos}>
            <Text style={[styles.nombreLocal, { color: colors.ink }]} numberOfLines={2}>
              {config.nombreLocal}
            </Text>
            <Text style={[styles.identidadSub, { color: colors.dim }]}>{subtitulo}</Text>
          </View>
        </TouchableOpacity>
        {!editando ? (
          <TouchableOpacity
            style={styles.editar}
            onPress={() => {
              tocar();
              empezarEdicion();
            }}
            accessibilityRole="button"
            accessibilityLabel="Editar el nombre del local"
          >
            <Text style={[styles.editarTexto, { color: colors.br }]}>Editar</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {editando ? (
        <View style={styles.edicion}>
          <FormField
            label="Nombre del local"
            value={nombre}
            onChangeText={(t) => {
              setNombre(t);
              setErrorNombreLocal(null);
            }}
            maxLength={LARGO_NOMBRE_LOCAL}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void guardarNombre()}
            error={errorNombreLocal ?? undefined}
          />
          <BotonesEdicion onCancelar={() => setEditando(false)} onGuardar={() => void guardarNombre()} guardando={guardandoNombre} />
        </View>
      ) : null}
    </View>
  );
}

// ─── 2. Color de la marca ──────────────────────────────────────────────────

function ColorMarca() {
  const { config } = useConfig();
  const { colors } = useTheme();
  const guardar = useGuardarConfig();
  const actual = config.marca;

  const elegir = (marca: string | null) => {
    if (marca === actual) return;
    void guardar({ marca }, 'Color de la marca actualizado');
  };

  return (
    <View>
      <SectionLabel>Color de la marca</SectionLabel>
      <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Color de la marca">
        {BRAND_COLORS.map((color) => {
          const elegido = actual === color;
          return (
            <TouchableOpacity
              key={color}
              style={[styles.swatch, { backgroundColor: color, borderColor: elegido ? colors.ink : 'transparent' }]}
              onPress={() => {
                tocar();
                elegir(color);
              }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${NOMBRE_COLOR[color]}`}
              accessibilityState={{ checked: elegido, selected: elegido }}
            >
              {elegido ? <Text style={styles.tilde}>✓</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.porDefecto}>
        <Chip
          label="Por defecto"
          active={actual === null}
          onPress={() => elegir(null)}
          accessibilityHint="Vuelve al color original de Duel, que se aclara solo en modo noche"
        />
        <Text style={[styles.ayuda, styles.flex1, { color: colors.dim }]}>El color de Duel, que se aclara solo de noche.</Text>
      </View>
    </View>
  );
}

// ─── 3. Apariencia ─────────────────────────────────────────────────────────

function Apariencia() {
  const { config } = useConfig();
  const guardar = useGuardarConfig();
  return (
    <Grupo titulo="Apariencia" sub="Cómo arranca la app en los celulares del local.">
      <FilaToggle
        label="Modo noche por defecto"
        sub="Recomendado para el turno noche"
        value={config.oscuroPorDefecto}
        onChange={(v) => void guardar({ oscuroPorDefecto: v })}
      />
    </Grupo>
  );
}

// ─── 4. Turnos y horarios ──────────────────────────────────────────────────

function Turnos() {
  const { config } = useConfig();
  const { colors } = useTheme();
  const guardar = useGuardarConfig();
  const [borrador, setBorrador] = useState<Turno[]>(config.turnos);
  const [sucio, setSucio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!sucio) setBorrador(config.turnos);
  }, [config.turnos, sucio]);

  const editar = (indice: number, campo: keyof Turno, valor: string) => {
    setBorrador((prev) => prev.map((t, i) => (i === indice ? { ...t, [campo]: valor } : t)));
    setSucio(true);
    setError(null);
  };

  const completarHora = (indice: number, campo: 'apertura' | 'cierre', valor: string) => {
    const hora = normalizarHora(valor);
    if (hora && hora !== valor) editar(indice, campo, hora);
  };

  const agregar = () => {
    if (borrador.length >= MAX_TURNOS) return;
    setBorrador((prev) => [...prev, { nombre: '', apertura: prev[prev.length - 1]?.cierre ?? '', cierre: '' }]);
    setSucio(true);
    setError(null);
  };

  const quitar = (indice: number) => {
    if (borrador.length <= MIN_TURNOS) return;
    setBorrador((prev) => prev.filter((_, i) => i !== indice));
    setSucio(true);
    setError(null);
  };

  const descartar = () => {
    setBorrador(config.turnos);
    setSucio(false);
    setError(null);
  };

  const guardarTurnos = async () => {
    if (guardando) return;
    const resultado = validarTurnos(borrador);
    if (!resultado.ok) {
      advertencia();
      setError(resultado.error);
      return;
    }
    setGuardando(true);
    const ok = await guardar({ turnos: resultado.turnos }, 'Turnos guardados');
    setGuardando(false);
    if (ok) setSucio(false);
  };

  const unSoloTurno = borrador.length <= MIN_TURNOS;
  const noSePuedeQuitar = unSoloTurno || guardando;

  return (
    <Grupo titulo="Turnos y horarios" sub="Definen qué se ve al abrir y contra qué se comparan las métricas.">
      {borrador.map((turno, i) => (
        <View key={i} style={[styles.turno, { borderTopColor: colors.line }]}>
          <View style={styles.turnoFila}>
            <FormField
              label={`Turno ${i + 1}`}
              value={turno.nombre}
              placeholder={EJEMPLOS_TURNO[i] ?? 'Turno'}
              onChangeText={(t) => editar(i, 'nombre', t)}
              maxLength={LARGO_NOMBRE_TURNO}
              autoCapitalize="sentences"
              containerStyle={styles.flex1}
              editable={!guardando}
              accessibilityLabel={`Nombre del turno ${i + 1}`}
            />
            <TouchableOpacity
              style={[styles.quitar, { borderColor: colors.line, opacity: noSePuedeQuitar ? 0.4 : 1 }]}
              onPress={() => {
                tocar();
                quitar(i);
              }}
              disabled={noSePuedeQuitar}
              accessibilityRole="button"
              accessibilityLabel={`Quitar el turno ${turno.nombre || i + 1}`}
              accessibilityHint={unSoloTurno ? 'Tiene que quedar al menos un turno' : undefined}
              accessibilityState={{ disabled: noSePuedeQuitar }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.dim} />
            </TouchableOpacity>
          </View>
          <View style={styles.turnoFila}>
            <FormField
              label="Abre"
              value={turno.apertura}
              placeholder="08:00"
              onChangeText={(t) => editar(i, 'apertura', t)}
              onEndEditing={(e) => completarHora(i, 'apertura', e.nativeEvent.text)}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              containerStyle={styles.flex1}
              style={tabularNums(14)}
              editable={!guardando}
              accessibilityLabel={`Hora de apertura del turno ${i + 1}, en formato horas y minutos`}
            />
            <FormField
              label="Cierra"
              value={turno.cierre}
              placeholder="15:00"
              onChangeText={(t) => editar(i, 'cierre', t)}
              onEndEditing={(e) => completarHora(i, 'cierre', e.nativeEvent.text)}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              containerStyle={styles.flex1}
              style={tabularNums(14)}
              editable={!guardando}
              accessibilityLabel={`Hora de cierre del turno ${i + 1}, en formato horas y minutos`}
            />
          </View>
          {cruzaMedianoche(turno.apertura, turno.cierre) ? (
            <Text style={[styles.ayuda, { color: colors.dim }]}>Cierra después de la medianoche.</Text>
          ) : null}
        </View>
      ))}

      <View style={[styles.turnosPie, { borderTopColor: colors.line }]}>
        <MensajeError texto={error} />
        <View style={styles.turnosAgregar}>
          <SmallButton label="+ Agregar turno" onPress={agregar} disabled={borrador.length >= MAX_TURNOS || guardando} />
          <Text style={[styles.ayuda, styles.flex1, { color: colors.dim }]}>
            {borrador.length >= MAX_TURNOS ? `Hasta ${MAX_TURNOS} turnos.` : 'Un turno puede terminar después de la medianoche.'}
          </Text>
        </View>
        {sucio ? (
          <BotonesEdicion
            onCancelar={descartar}
            onGuardar={() => void guardarTurnos()}
            guardando={guardando}
            cancelarLabel="Descartar"
            guardarLabel="Guardar turnos"
          />
        ) : null}
      </View>
    </Grupo>
  );
}

// ─── 5. Stock ──────────────────────────────────────────────────────────────

function Stock() {
  const { config } = useConfig();
  const guardar = useGuardarConfig();
  return (
    <Grupo titulo="Stock" sub="Cuándo avisa que hay que reponer.">
      <FilaNumero
        label="Aviso de stock bajo"
        sub="Avisa al quedar esta cantidad o menos, salvo que el producto tenga su propio aviso"
        valor={config.alertaStock}
        lim={LIMITES.alertaStock}
        onGuardar={(n) => guardar({ alertaStock: n })}
      />
    </Grupo>
  );
}

// ─── 6. Torneos ────────────────────────────────────────────────────────────

const enMinutos = (n: number) => `${n} min`;

function Torneos() {
  const { config } = useConfig();
  const guardar = useGuardarConfig();
  const guardarCampo = (campo: keyof DefaultsTorneo) => (n: number) => guardar({ torneo: { ...config.torneo, [campo]: n } });

  return (
    <Grupo titulo="Torneos" sub="El juez arranca cada torneo con estos valores ya cargados.">
      <FilaNumero label="Rondas" sub="Por torneo" valor={config.torneo.rondas} lim={LIMITES.rondas} onGuardar={guardarCampo('rondas')} />
      <FilaNumero
        label="Minutos por ronda"
        sub="Reloj de la sala"
        valor={config.torneo.minutos}
        lim={LIMITES.minutos}
        paso={5}
        formato={enMinutos}
        onGuardar={guardarCampo('minutos')}
      />
      <FilaNumero
        label="Tiempo extra"
        sub="Lo que suma el juez al llegar a cero"
        valor={config.torneo.extra}
        lim={LIMITES.extra}
        formato={enMinutos}
        onGuardar={guardarCampo('extra')}
      />
      <FilaNumero
        label="Inscripción"
        sub="Lo que paga cada jugador"
        valor={config.torneo.inscripcion}
        lim={LIMITES.inscripcion}
        paso={500}
        formato={formatARS}
        onGuardar={guardarCampo('inscripcion')}
      />
      <FilaNumero label="Cupo" sub="Máximo de jugadores" valor={config.torneo.cupo} lim={LIMITES.cupo} onGuardar={guardarCampo('cupo')} />
      <FilaToggle
        label="Los jugadores reportan su resultado"
        sub="Desde su celular; si no coinciden, decide el juez"
        value={config.reporteJugador}
        onChange={(v) => void guardar({ reporteJugador: v })}
      />
      <FilaToggle
        label="Premios con crédito de cafetería"
        sub="Se acredita a la cuenta del jugador al entregar el premio"
        value={config.creditoPremio}
        onChange={(v) => void guardar({ creditoPremio: v })}
      />
    </Grupo>
  );
}

// ─── 7. Cobro ──────────────────────────────────────────────────────────────

function Cobro() {
  const { config } = useConfig();
  const guardar = useGuardarConfig();
  return (
    <Grupo titulo="Cobro" sub="Qué pasa cuando se cobra una mesa.">
      <FilaToggle
        label="Cobrar descuenta stock"
        sub="Lo vendido baja del stock solo"
        value={config.descontarStock}
        onChange={(v) => void guardar({ descontarStock: v })}
      />
    </Grupo>
  );
}

// ─── 8. Temporada ──────────────────────────────────────────────────────────

function Temporada() {
  const { config } = useConfig();
  const { colors } = useTheme();
  const guardar = useGuardarConfig();
  const [nombre, setNombre] = useState(config.temporada.nombre);
  const [editado, setEditado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [empezando, setEmpezando] = useState(false);

  useEffect(() => {
    if (!editado) setNombre(config.temporada.nombre);
  }, [config.temporada.nombre, editado]);

  const guardarNombre = async () => {
    if (guardando) return;
    const problema = errorNombre(nombre, LARGO_NOMBRE_TEMPORADA, 'el nombre de la temporada');
    if (problema) {
      advertencia();
      setError(problema);
      return;
    }
    const limpio = limpiarTexto(nombre);
    if (limpio === config.temporada.nombre) {
      setEditado(false);
      return;
    }
    setGuardando(true);
    const ok = await guardar({ temporada: { ...config.temporada, nombre: limpio } }, 'Nombre de la temporada guardado');
    setGuardando(false);
    if (ok) setEditado(false);
  };

  const empezarHoy = async () => {
    if (empezando) return;
    const escrito = limpiarTexto(nombre);
    const nombreNuevo = editado && escrito && escrito.length <= LARGO_NOMBRE_TEMPORADA ? escrito : config.temporada.nombre;
    setEmpezando(true);
    const ok = await guardar({ temporada: { nombre: nombreNuevo, inicio: fechaLocal() } }, `${nombreNuevo} arrancó hoy`);
    setEmpezando(false);
    if (ok) {
      setEditado(false);
      setError(null);
    }
  };

  const confirmarInicio = () => {
    Alert.alert(
      '¿Empezar temporada nueva hoy?',
      'El ranking va a contar solo los torneos desde hoy. Los anteriores siguen en el historial.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Empezar hoy', onPress: () => void empezarHoy() },
      ]
    );
  };

  const inicio = config.temporada.inicio;
  const empezoHoy = inicio === fechaLocal();

  return (
    <Grupo titulo="Temporada" sub="El ranking suma los torneos desde que empieza la temporada.">
      <View style={[styles.bloque, { borderTopColor: colors.line }]}>
        <FormField
          label="Nombre de la temporada"
          value={nombre}
          onChangeText={(t) => {
            setNombre(t);
            setEditado(true);
            setError(null);
          }}
          maxLength={LARGO_NOMBRE_TEMPORADA}
          returnKeyType="done"
          onSubmitEditing={() => void guardarNombre()}
          error={error ?? undefined}
        />
        {editado ? (
          <BotonesEdicion
            onCancelar={() => {
              setEditado(false);
              setError(null);
            }}
            onGuardar={() => void guardarNombre()}
            guardando={guardando}
          />
        ) : null}
      </View>
      <Fila label="Inicio" sub={inicio ? 'Cuentan los torneos desde esta fecha' : undefined}>
        <Text style={[styles.valorTexto, { color: colors.gold }, tabularNums(12.5)]}>
          {inicio ? fechaConAnio(inicio) : 'Cuentan todos los torneos'}
        </Text>
      </Fila>
      <View style={[styles.bloque, { borderTopColor: colors.line }]}>
        <Button
          label={empezoHoy ? 'La temporada empezó hoy' : 'Empezar temporada nueva hoy'}
          variant="secondary"
          onPress={confirmarInicio}
          disabled={empezoHoy}
          loading={empezando}
        />
      </View>
    </Grupo>
  );
}

// ─── 9. Equipo ─────────────────────────────────────────────────────────────

function AccesoEquipo() {
  const router = useRouter();
  const { colors } = useTheme();
  const { pendientes, error } = useEquipo({ soloPendientes: true });
  const cantidad = pendientes.length;
  const sub = error
    ? 'No se pudo ver si hay solicitudes nuevas'
    : cantidad > 0
      ? `${cantidad === 1 ? 'Una persona espera' : `${cantidad} personas esperan`} tu aprobación`
      : 'Aprobaciones, roles y código de invitación';

  return (
    <Card onPress={() => router.push('/(tabs)/ajustes/equipo')} accessibilityLabel={`Equipo. ${sub}`}>
      <View style={styles.equipoFila}>
        <View style={styles.filaTextos}>
          <Text style={[styles.grupoTitulo, { color: colors.ink }]}>Equipo</Text>
          <Text style={[styles.filaSub, { color: error ? colors.dg : colors.dim }]}>{sub}</Text>
        </View>
        {cantidad > 0 ? <Badge label={cantidad === 1 ? '1 pendiente' : `${cantidad} pendientes`} tone="br" /> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.dim} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  contenido: { gap: 16 },
  notaPie: { fontFamily: Typography.fontFamily.regular, fontSize: 11.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },

  grupo: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, paddingTop: 4, paddingBottom: 6 },
  grupoCabeza: { paddingTop: 12, paddingBottom: 10 },
  grupoTitulo: { fontFamily: Typography.fontFamily.bold, fontSize: 14.5, letterSpacing: -0.15 },
  grupoSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 16, marginTop: 3 },

  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, minHeight: 56 },
  filaTextos: { flex: 1 },
  filaLabel: { fontFamily: Typography.fontFamily.medium, fontSize: 13 },
  filaSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
  valorTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 12.5, textAlign: 'right', maxWidth: '55%' },

  bloque: { borderTopWidth: 1, paddingVertical: 12, gap: 8 },
  botones: { flexDirection: 'row', gap: 8 },
  botonChico: { flex: 1 },
  botonGrande: { flex: 1.6 },
  error: { fontFamily: Typography.fontFamily.medium, fontSize: 12, lineHeight: 17 },
  ayuda: { fontFamily: Typography.fontFamily.regular, fontSize: 11, lineHeight: 16 },

  identidad: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  identidadFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identidadToque: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  logoCaja: {
    width: 44,
    height: 44,
    borderRadius: Radii.avatar,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarca: { width: 36, height: 36 },
  logoPropio: { width: '100%', height: '100%' },
  identidadTextos: { flex: 1 },
  nombreLocal: { fontFamily: Typography.fontFamily.semibold, fontSize: 14 },
  identidadSub: { fontFamily: Typography.fontFamily.regular, fontSize: 11, marginTop: 2 },
  editar: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  editarTexto: { fontFamily: Typography.fontFamily.semibold, fontSize: 12 },
  edicion: { gap: 8 },

  swatches: { flexDirection: 'row', gap: 9 },
  swatch: { flex: 1, height: 44, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  tilde: { color: '#FFFFFF', fontFamily: Typography.fontFamily.bold, fontSize: 15 },
  porDefecto: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },

  turno: { borderTopWidth: 1, paddingVertical: 12, gap: 8 },
  turnoFila: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  quitar: { width: 44, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  turnosPie: { borderTopWidth: 1, paddingTop: 12, paddingBottom: 6, gap: 10 },
  turnosAgregar: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  equipoFila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
});
