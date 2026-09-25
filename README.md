# Duel

App móvil para un café que además corre torneos de TCG (los juegos los define cada local). Junta en un solo lugar la operación del salón (mesas, pedidos, cobro y cierre de caja), un stock único para cafetería y TCG, y los torneos en vivo: rondas con timer, emparejamientos, resultados, premios contra stock o crédito de cafetería, ranking e historial de cada jugador.

Cada perfil ve solo lo suyo: el rol define las pestañas, la pantalla de inicio y los pendientes.

## Roles

| Rol | Inicio | Pestañas | Qué puede hacer |
| --- | --- | --- | --- |
| Mozo | Hoy | Hoy, Salón (con el pedido de cada mesa), Stock | Tomar pedidos, cobrar (descuenta stock y crédito del jugador), ver stock |
| Juez | Hoy | Hoy, Torneo, Premios, Stock TCG | Crear y correr torneos, cargar resultados, manejar el timer, entregar premios y marcar inscripciones cobradas |
| Jugador | Mi duelo | Mi duelo, Historial, Tabla | Ver su mesa y su rival, reportar su resultado, ver la tabla y su historial |
| Admin | Hoy | Hoy, Salón, Torneo, Stock, Ajustes (la Caja se abre desde Hoy) | Todo lo anterior, más equipo, ingreso de mercadería, cierre de caja y ajustes del local |

- El jugador se registra y entra al instante.
- Mozo y juez se registran con el código de invitación del local y quedan pendientes hasta que el admin los aprueba en Ajustes > Equipo. Reciben un mail para verificar su dirección; el admin ve en la solicitud si ya la verificaron.
- El admin puede bloquear una cuenta de jugador (Ajustes > Equipo > Jugadores): pierde el acceso y deja de aparecer en las búsquedas del staff, pero conserva su historial y su crédito, y se puede reactivar.
- La cuenta de admin no se registra desde la app: se crea desde la consola de Firebase (ver más abajo).
- Las pestañas ocultas para un rol también están protegidas en la pantalla: si alguien llega por un enlace (`duel://…`), ve un aviso y no los controles.
- Las cuentas de la versión anterior (con `role: 'user'`) se pasan solas a jugador la primera vez que entran. Si un registro se cortó sin guardar el perfil, al iniciar sesión la app pide completarlo.

## Stack

- Expo SDK 54 con expo-router 6, React Native 0.81, React 19 y TypeScript estricto.
- Firebase JS SDK 12 (Authentication, Cloud Firestore y Storage), inicializado en `config/firebase.ts`.
- No hay backend propio: toda la lógica corre en el cliente y la seguridad la hacen cumplir las reglas de Firestore y Storage (`firestore.rules`, `storage.rules`).

## Puesta en marcha

Requisitos: Node 20 o superior, [pnpm](https://pnpm.io/installation) 11 y un proyecto de Firebase. Para el modo demo y los tests de reglas hace falta además Java 21 o superior (los emuladores de Firebase lo usan).

El proyecto usa pnpm con `node_modules` plano (`nodeLinker: hoisted` en `pnpm-workspace.yaml`), que es lo que mejor se lleva con Expo y React Native. No mezcles con `npm install`: el lockfile es `pnpm-lock.yaml`.

1. Creá el proyecto en la [consola de Firebase](https://console.firebase.google.com/) y habilitá:
   - Authentication con el proveedor Correo electrónico/contraseña.
   - Cloud Firestore (modo producción).
   - Storage.
2. Registrá una app web en Configuración del proyecto > General > Tus apps y copiá sus credenciales a un archivo `.env` en la raíz (ya está en `.gitignore`):

   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   EXPO_PUBLIC_FIREBASE_APP_ID=
   ```

   Si falta alguna, la app no arranca y el error dice cuál.
3. Instalá las dependencias y levantá el servidor de desarrollo:

   ```
   pnpm install
   pnpm start
   ```

   Abrí la app con Expo Go o un emulador. Si cambiaste el `.env`, reiniciá con `pnpm start --clear`.

   Expo Go de las tiendas abre solo la última versión de Expo, y este proyecto está en SDK 54. En Android se puede instalar el Expo Go de SDK 54 desde [expo.dev/go](https://expo.dev/go?sdkVersion=54&platform=android&device=true). En iPhone no hay Expo Go para versiones viejas: usá la versión web (`pnpm start`, tecla `w`, o abrí `http://<ip-de-la-pc>:8081` en el navegador del celular) o un build de desarrollo.

## Modo demo

Para ver la app con datos sin tocar el proyecto de Firebase real:

```
pnpm demo
```

Necesita Java 21 o superior. En Windows: `winget install --id EclipseAdoptium.Temurin.21.JRE -e`. El script lo encuentra solo aunque la terminal todavía no tenga el `PATH` nuevo.

Levanta los emuladores de Firebase en la PC (Authentication, Firestore y Storage, con las mismas reglas del repo), carga un local de prueba y arranca Expo con la app apuntando a ellos. No hace falta el `.env`. Los datos incluyen dos salas con mesas de café y de duelo, pedidos abiertos, carta y stock (con productos en alerta y sin stock), ventas de la última semana, un torneo en curso en la ronda 2 con el reloj corriendo, un torneo de ayer con premios por entregar y una solicitud de mozo pendiente.

Cuentas de prueba (contraseña `duel1234` para todas). En la pantalla de entrada, el recuadro "Modo demo" las completa con un toque:

| Rol | Email | Cómo entrar |
| --- | --- | --- |
| Admin | `admin@duel.test` | "Entrar con cuenta de administración" |
| Juez | `juez@duel.test` | Perfil Juez |
| Mozo | `mozo@duel.test` | Perfil Mozo |
| Jugador | `jugador@duel.test` | Perfil Jugador (está anotado en el torneo en curso y tiene crédito) |

El código de invitación del demo es `DUEL2345`. Cada `pnpm demo` arranca de cero: lo que cambies se pierde al cortarlo con Ctrl+C.

- El celular tiene que estar en el mismo Wi-Fi que la PC. La primera vez, Windows puede preguntar si deja que Java y Node usen la red: aceptá para redes privadas.
- Si la PC tiene varias placas de red y el script elige mal la IP, forzala con la variable `DEMO_HOST` (en PowerShell: `$env:DEMO_HOST="192.168.0.10"; pnpm demo`).
- Los emuladores usan puertos propios (Auth 9099, Firestore 8180, Storage 9299), así que `pnpm test:rules` se puede correr con el demo abierto.
- Lo que pases de más va a `expo start`, por ejemplo `pnpm demo --web`.
- El modo demo solo existe en desarrollo: un build de producción siempre usa el `.env`.

## Desplegar reglas e índices

Las reglas y los índices viven en el repo y se despliegan con Firebase CLI. Hacelo antes de usar la app contra un proyecto nuevo: sin reglas desplegadas, Firestore rechaza todo (o, peor, lo permite todo si el proyecto quedó en modo de prueba).

```
pnpm firebase login
pnpm desplegar
```

`pnpm desplegar` sube reglas, índices y reglas de Storage al proyecto del `.env` (el mismo que usa la app), sin escribir el ID. Para una sola parte: `pnpm desplegar firestore:rules`. `pnpm firebase` es un atajo a Firebase CLI 15 (`pnpm dlx firebase-tools@15`), sin instalarla global.

Si Storage no está habilitado en el proyecto, el despliegue de sus reglas falla: desplegá `pnpm desplegar firestore:rules,firestore:indexes` y habilitalo cuando quieras cargar el logo.

- `firestore.rules`: permisos de Firestore (ver Seguridad).
- `firestore.indexes.json`: índices compuestos que necesitan las consultas de torneos. Tardan unos minutos en construirse después del primer despliegue. Mientras tanto, Historial, Tabla y Mi duelo muestran "esta pantalla todavía se está preparando"; si sigue así, falta `pnpm firebase deploy --only firestore:indexes`.
- `storage.rules`: solo la carpeta `logos/` (lectura pública, escritura del admin, imágenes de menos de 2 MB).

Las reglas de Storage leen el perfil del usuario en Firestore para saber si es admin. La primera vez que las despliegues, la CLI pide permiso para que Storage consulte Firestore: aceptalo, si no, subir el logo falla con permiso denegado.

Para usar `pnpm firebase deploy` directo, pasale `--project <id-del-proyecto>` o creá un `.firebaserc` con `{ "projects": { "default": "<id-del-proyecto>" } }`.

## Primera cuenta de admin

La app no deja crear administradores, así que el primero se da de alta a mano (la consola de Firebase no pasa por las reglas):

1. Authentication > Usuarios > Agregar usuario: cargá email y contraseña. Copiá el UID que te asigna.
2. Firestore > Iniciar colección `users` (o abrila si ya existe) > Agregar documento con ID igual a ese UID, con estos campos:

   | Campo | Tipo | Valor |
   | --- | --- | --- |
   | `uid` | string | el mismo UID |
   | `nombre` | string | nombre visible, por ejemplo `Dueño` |
   | `email` | string | el mismo email de Authentication, en minúsculas |
   | `role` | string | `admin` |
   | `estadoAprobacion` | string | `aprobado` |
   | `creadoEn` | timestamp | la fecha actual |

3. Entrá a la app con ese email y contraseña.

Para sumar otro admin más adelante, que se registre como mozo o juez, aprobalo y cambiale el rol a Admin desde Ajustes > Equipo.

## Configuración inicial del local

Nada del negocio está fijo en el código: todo sale de Firestore y se edita desde la app con la cuenta de admin.

- Ajustes: nombre del local, logo, color de marca, modo oscuro por defecto, turnos, alerta de stock, rubros de cafetería, valores por defecto de los torneos (rondas, minutos, tiempo extra, inscripción, cupo), juegos que se ofrecen al crear un torneo, medios de pago que aparecen al cobrar, temporada del ranking y los interruptores de reporte de resultados por el jugador, premios con crédito y descuento de stock al cobrar. Se guarda en `config/publico`. Mientras no exista, la app usa los valores por defecto de `lib/config.ts`.
- Turnos: definen la jornada de caja. Si un turno cruza la medianoche (por ejemplo 15:00 a 00:30), lo cobrado después de las 00:00 cuenta para el día en que empezó el turno, así el cierre de la noche no se parte en dos fechas.
- Color de marca: cualquier color se ajusta solo (de día y de noche) para que los textos lleguen a un contraste de 4,5:1.
- Salón: salas y mesas (de café o de duelo) con su posición en el plano.
- Stock: productos de cada rubro e ingresos de mercadería. Los rubros de cafetería los define el local (por defecto Café y Pastelería); TCG y Servicios (alquiler, agua) son fijos de la app. Un producto de cafetería puede cambiar de rubro desde su ficha, y quitar un rubro de Ajustes no borra sus productos.

### Código de invitación para el equipo

1. Con la cuenta de admin, andá a Ajustes > Equipo y generá el código de invitación. Se guarda en `config/privado`, que solo el admin puede leer, y sirve por 7 días.
2. Pasáselo a quien se vaya a sumar como mozo o juez. Al registrarse elige el rol y escribe el código; las reglas de Firestore lo validan contra `config/privado`.
3. La cuenta queda pendiente y aparece en Ajustes > Equipo para aprobarla o rechazarla.

Si el código se filtra, generá otro: el anterior deja de servir para registros nuevos. Pasados los 7 días vence solo y Equipo avisa que hay que generar uno nuevo. Los códigos generados con versiones anteriores (sin vencimiento) ya no sirven: generá uno nuevo. Si nunca se generó, nadie puede registrarse como mozo o juez.

## Modelo de datos

Colecciones de Firestore (contrato completo en `lib/pedido.ts`, `lib/torneo.ts`, `lib/config.ts` y `lib/users.ts`). Las reglas rechazan campos que no estén en este contrato.

| Colección | Campos | Notas |
| --- | --- | --- |
| `config/publico` | `nombreLocal`, `logoUrl`, `marca`, `oscuroPorDefecto`, `turnos`, `alertaStock`, `torneo`, `temporada` (`nombre`, `inicio`, `inicioMs`), `reporteJugador`, `creditoPremio`, `descontarStock`, `juegos`, `mediosPago`, `rubrosCafeteria` | Lectura pública (el splash la usa antes del login). |
| `config/privado` | `codigoInvitacion`, `codigoVenceEn` | Solo admin. |
| `users/{uid}` | `uid`, `nombre`, `email`, `role` (`admin`, `mozo`, `juez`, `jugador`), `estadoAprobacion` (`pendiente`, `aprobado`, `rechazado`), `codigoInvitacion?`, `emailVerificado?`, `creadoEn` | Privado: el propio usuario y el admin. El ID es el UID de Authentication. |
| `jugadores/{uid}` | `uid`, `nombre`, `nombreBusqueda` (minúsculas, sin tildes), `creditoCafeteria`, `ultimaVenta?`, `ultimoPremio?`, `activo?`, `creadoEn` | Directorio público para el staff: buscar jugadores y mover crédito sin ver emails. Se crea con el alta del jugador (o solo, al abrir la app, si faltaba). |
| `salas/{id}` | `nombre`, `orden`, `creadoEn` | |
| `mesas/{id}` | `numero`, `x`, `y`, `salaId`, `tipo` (`cafe`, `duelo`), `estado` (`libre`, `consumo`), `pedido` (ítems), `creadoEn` | "Duelo en curso" no se guarda: se deriva del torneo en curso. |
| `productos/{id}` | `nombre`, `precio`, `rubro` (`Café`, `Pastelería`, `TCG`, `Mesa`), `controlStock`, `stock?`, `unidad?`, `alerta?`, `activo?`, `creadoEn` | Los servicios de mesa van con `controlStock: false`. |
| `tcg_productos/{id}` | `nombre`, `valor`, `stock`, `unidad?`, `alerta?`, `activo?`, `creadoEn` | Colección heredada para TCG. |
| `ventas/{id}` | `mesaId`, `mesaNum`, `items`, `subtotal`, `creditoAplicado`, `creditoUid`, `total`, `medioPago`, `fecha`, `hora`, `creadoPor`, `creadoEn` | Inmutable. `total = subtotal - creditoAplicado`. `fecha` es la jornada de caja (ver Turnos) y `hora` la hora local. `credito_torneo` solo si el crédito pagó toda la cuenta. |
| `ingresos/{id}` | `productoId`, `coleccion`, `nombre`, `rubro`, `cantidad`, `unidad`, `costoUnitario`, `fecha`, `creadoPor`, `creadoEn` | Inmutable, solo admin. |
| `torneos/{id}` | `nombre`, `juego`, `formatoId`, `formato`, `totalRondas`, `topCut`, `minutosPorRonda`, `minutosExtra`, `inscripcion`, `cupo`, `jugadores`, `jugadoresUids`, `estado` (`en_curso`, `finalizado`), `rondaActual`, `rondas`, `premios`, `rondaFinEn`, `rondaRestanteMs`, `rondaPausada`, `fecha`, `posiciones?`, `finalizadoEn?`, `creadoPor`, `creadoEn` | El timer se guarda como hora de fin en hora del servidor, así sobrevive a que el juez cierre la app y todos ven el mismo reloj. Cada ronda guarda su `semilla` de sorteo y sus partidas en orden de mesa (la mesa N en la posición N-1). |
| `torneos/{id}/entregas/{puesto}` | `puesto`, `jugadorUid`, `creditoCafeteria`, `cantidadProducto`, `entregadoPor`, `entregadoEn` | Registro único e inmutable de cada entrega de premio: el crédito de un premio no se puede acreditar dos veces. |
| `bloqueos/torneo` | `torneoId`, `actualizadoEn` | Candado de "un torneo en curso a la vez": crear un torneo lo toma en una transacción y cerrarlo lo libera. |
| `relojes/{uid}` | `t` | Hora del servidor que escribe cada teléfono al abrir la app para medir cuánto está corrida su hora (`hooks/useReloj.ts`). |
| `torneos/{id}/reportes/{ronda}_{mesa}_{uid}` | `ronda`, `mesa`, `uid`, `resultado` (`2-0`, `2-1`, `1-2`, `0-2`, desde el jugador 1), `creadoEn` | Lo escribe cada jugador desde su celular. |

Los contadores (stock y crédito) se modifican siempre con `increment()`. El cobro, guardar un pedido, entregar un premio y crear un torneo van en transacciones: sin señal fallan en el acto (en vez de quedar en una cola en memoria que se pierde si Android cierra la app) y si otro dispositivo cambió algo en el medio no se pisa ni se cobra dos veces. El stock puede quedar negativo si se vende de más; la app lo muestra en rojo.

Los documentos de la versión anterior se leen sin romper: ventas sin medio de pago (fecha y hora se recalculan de su marca de tiempo), renglones con `productoId`, torneos con `valorEntrada`, `tiempoPorRonda` o premios en `sobres`, y productos con `controlStock` sin número de stock.

Storage: `logos/` guarda el logo del local.

## Seguridad

"Aprobado" significa `estadoAprobacion == 'aprobado'` en el perfil. "Staff" es admin, mozo o juez aprobado. Todo lo que no figura acá está denegado.

| Recurso | Leer | Escribir |
| --- | --- | --- |
| `config/publico` | Todos, incluso sin sesión | Admin |
| `config/privado` | Admin | Admin; el código siempre con vencimiento (hasta 31 días) |
| `users` | Cada uno el suyo; admin todos | Alta: el propio usuario (jugador aprobado, o mozo/juez pendiente con código válido y vigente). Edición: el usuario solo su nombre, marcar su email verificado (si el token lo confirma) o pasar su cuenta vieja a jugador; admin rol, aprobación y nombre. Baja: admin |
| `jugadores` | Cada jugador el suyo; staff todos | Alta: el propio jugador aprobado, con crédito 0, en el mismo batch que su perfil. Edición: el jugador solo su nombre; el juez acredita solo al entregar un premio de un torneo cerrado, al ganador de ese puesto, por el monto del premio (hasta $1.000.000) y una sola vez (`ultimoPremio` + registro en `entregas`); el mozo descuenta solo junto con la venta que aplica ese crédito (`ultimaVenta`); el admin puede corregir a mano, con tope, y bloquear o reactivar (`activo`); nunca queda en negativo. Baja: admin |
| `salas` | Staff | Admin |
| `mesas` | Staff | Admin; el mozo solo cambia `pedido` y `estado` |
| `productos`, `tcg_productos` | Staff | Admin; mozo y juez solo bajan `stock`, hasta 1.000 por vez y sin pasar de -1.000 |
| `ventas` | Admin y mozo; el jugador, las que usaron su crédito | Alta: admin y mozo, a su nombre, con la fecha de hoy (o la jornada abierta); si aplica crédito, descuenta ese mismo monto al jugador en la misma escritura. Nunca se editan ni se borran |
| `ingresos` | Admin | Alta: admin, con la fecha de hoy. Nunca se editan ni se borran |
| `torneos` | Cualquier usuario aprobado | Admin y juez, con la fecha de hoy, sin posiciones y tomando el candado en la misma escritura; borrar solo admin. Cerrado el torneo, el juez solo actualiza los premios existentes (no agrega puestos) |
| `torneos/{id}/entregas` | Staff | Admin y juez, una por puesto, cuando el premio pasa a entregado. Nunca se editan; borra solo el admin |
| `reportes` | Cualquier usuario aprobado | El jugador sentado en esa mesa de la ronda actual del torneo en curso, si el local permite que los jugadores reporten; borrar admin y juez |
| `bloqueos/torneo` | Admin y juez | Admin y juez, con la hora del servidor: se toma solo si el torneo anterior terminó (o ya no existe) y se libera al cerrarlo. El admin puede destrabarlo |
| `relojes/{uid}` | El propio usuario | El propio usuario, solo con la hora del servidor |
| Storage `logos/` | Todos | Admin, imágenes de menos de 2 MB |

Las fechas de ventas, ingresos y torneos tienen que ser las de la jornada en curso: el día argentino (UTC-3) más 6 horas para la madrugada de un turno nocturno.

Nadie puede crearse como admin, aprobarse solo, cambiarse el rol, inflar un crédito o vaciarlo sin un premio o una venta que lo respalde, acreditar dos veces el mismo premio, editar o borrar ventas, leer el código de invitación, leer los emails de otros, cargar un torneo retroactivo ni reportar resultados en nombre de otro jugador. Los tests de `firestore-tests/` cubren cada uno de esos casos.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm start` | Levanta Expo (`expo start`). |
| `pnpm demo` | Emuladores de Firebase con datos de prueba y Expo apuntando a ellos (ver Modo demo). |
| `pnpm desplegar [partes]` | Sube reglas e índices al proyecto del `.env`. |
| `pnpm firebase <comando>` | Firebase CLI 15 sin instalarla global (login, deploy). |
| `pnpm typecheck` | Chequeo de tipos con `tsc --noEmit`. |
| `pnpm test` | Tests unitarios con Jest (preset `jest-expo`). |
| `pnpm qa` | Tipos y tests unitarios, lo mismo que debería pasar antes de cada commit. |
| `pnpm test:rules` | Levanta los emuladores de Firestore y Storage y corre `firestore-tests/` contra `firestore.rules` y `storage.rules`. Necesita Java 21 o superior en el `PATH`. |

Los tests de reglas usan el proyecto de demo `demo-duel`, así que no tocan ningún proyecto real ni necesitan credenciales.

## Estructura

```
app/                 Rutas de expo-router
  (auth)/            Splash, login y registro
  (tabs)/            Pantallas por rol: hoy, salon/, torneo/, premios, stock, caja, ajustes, duelo, tabla, historial
components/          Componentes de UI compartidos
config/firebase.ts   Inicialización de Firebase
constants/           Tema (colores, tipografía) y roles
contexts/            Tema, configuración del local, perfil del usuario, avisos
hooks/               Suscripciones a Firestore (catálogo, mesas, salas, torneo, caja, directorio de jugadores, reloj)
lib/                 Tipos del contrato de datos y lógica pura (pedidos, torneos, jugadores, fechas y jornada, reloj, errores)
firestore.rules      Reglas de Firestore
storage.rules        Reglas de Storage
firestore.indexes.json
firestore-tests/     Tests de reglas contra los emuladores
```
