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

- Hay un solo inicio de sesión (email y contraseña) para todos: el rol sale de la cuenta, no se elige al entrar.
- Desde la app solo se registran jugadores, que entran al instante.
- Las cuentas de mozo y juez las crea el admin en Ajustes > Equipo > Sumar al equipo (ver más abajo). Entran con el email y la contraseña que les pasa el admin, y la cambian en Mi cuenta.
- El admin puede bloquear una cuenta de jugador (Ajustes > Equipo > Jugadores): pierde el acceso y deja de aparecer en las búsquedas del staff, pero conserva su historial y su crédito, y se puede reactivar.
- La cuenta de admin no se crea desde la app: se crea desde la consola de Firebase (ver más abajo).
- El juez (o el admin) puede jugar el torneo que maneja: en Nuevo torneo, paso Inscriptos, "Juego yo también" lo anota con la misma cuenta.
- Toda cuenta arranca con una silueta como avatar; en Mi cuenta cada uno pone, cambia o quita su foto.
- Jugadores, mozos y jueces pueden borrar su cuenta en Mi cuenta > Borrar mi cuenta, con su contraseña (ver [Baja de cuenta](#baja-de-cuenta)).
- Las pestañas ocultas para un rol también están protegidas en la pantalla: si alguien llega por un enlace (`duel://…`), ve un aviso y no los controles.
- Las cuentas de la versión anterior (con `role: 'user'`) se pasan solas a jugador la primera vez que entran. Si un registro se cortó sin guardar el perfil, al iniciar sesión la app pide completarlo.

## Stack

- Expo SDK 57 con expo-router, React Native 0.86, React 19.2 y TypeScript 6 estricto.
- Firebase JS SDK 12 (Authentication y Cloud Firestore), inicializado en `config/firebase.ts`.
- Tipografía (Google Fonts, licencia libre): Space Grotesk para títulos y cifras (`Typography.display`) y Plus Jakarta Sans para el resto (`Typography.fontFamily`), en `constants/theme.ts`.
- No hay backend propio: toda la lógica corre en el cliente y la seguridad la hacen cumplir las reglas de Firestore (`firestore.rules`).
- No usa Storage: el plan gratis de Firebase ya no lo incluye. Las fotos de perfil y el logo se guardan como imágenes chicas dentro de Firestore (ver Modelo de datos).

## Puesta en marcha

Requisitos: Node 20 o superior, [pnpm](https://pnpm.io/installation) 11 y un proyecto de Firebase. Para los tests de reglas hace falta además Java 21 o superior (los emuladores de Firebase lo usan).

El proyecto usa pnpm con `node_modules` plano (`nodeLinker: hoisted` en `pnpm-workspace.yaml`), que es lo que mejor se lleva con Expo y React Native. No mezcles con `npm install`: el lockfile es `pnpm-lock.yaml`.

1. Creá el proyecto en la [consola de Firebase](https://console.firebase.google.com/) y habilitá:
   - Authentication con el proveedor Correo electrónico/contraseña.
   - Cloud Firestore (modo producción).
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

   Expo Go de las tiendas (Android y iPhone) abre el proyecto: está en la misma versión de SDK. Si el celular no encuentra la PC en la red, probá `pnpm start --tunnel`.

## Desplegar reglas e índices

Las reglas y los índices viven en el repo y se despliegan con Firebase CLI. Hacelo antes de usar la app contra un proyecto nuevo: sin reglas desplegadas, Firestore rechaza todo (o, peor, lo permite todo si el proyecto quedó en modo de prueba).

```
pnpm firebase login
pnpm desplegar
```

`pnpm desplegar` sube las reglas y los índices de Firestore al proyecto del `.env` (el mismo que usa la app), sin escribir el ID. Para una sola parte: `pnpm desplegar firestore:rules`. `pnpm firebase` es un atajo a Firebase CLI 15 (`pnpm dlx firebase-tools@15`), sin instalarla global.

- `firestore.rules`: permisos de Firestore (ver Seguridad).
- `firestore.indexes.json`: índices compuestos que necesitan las consultas de torneos. Tardan unos minutos en construirse después del primer despliegue. Mientras tanto, Historial, Tabla y Mi duelo muestran "esta pantalla todavía se está preparando"; si sigue así, falta `pnpm firebase deploy --only firestore:indexes`. También saca del índice las imágenes (`fotoUrl`, `logoUrl`), que nunca se consultan.

Para usar `pnpm firebase deploy` directo, pasale `--project <id-del-proyecto>` o creá un `.firebaserc` con `{ "projects": { "default": "<id-del-proyecto>" } }`.

## Distribución

Mientras la app no esté en las tiendas, se instala desde links:

| Para | Cómo | Comando |
| --- | --- | --- |
| Android | APK que se descarga desde un link de expo.dev (o su QR). La primera vez el celular pide permitir instalar apps de origen desconocido. | `pnpm apk` |
| Cualquier celular o compu | Versión web en `https://<proyecto>.web.app`. En el iPhone: Safari → Compartir → Agregar a inicio; en Android: Chrome → Instalar app. Se abre sin la barra del navegador. | `pnpm desplegar hosting` |
| iPhone (app) | TestFlight, con link público para hasta 10.000 personas. Hace falta la cuenta de Apple Developer (USD 99 por año). | `pnpm testflight` |
| Google Play | AAB (el formato que pide Play) para subir a Play Console: primero a una prueba cerrada y después a producción. Qué cargar en cada pantalla: [docs/google-play.md](docs/google-play.md). | `pnpm play` |

- Los builds corren en la nube de Expo (EAS), así que no hace falta Mac ni Android Studio. El proyecto es `@fabrithompson/duel` en expo.dev.
- Las credenciales de Firebase de los builds están en las variables de EAS (el `.env` no se sube). Si cambian: `pnpm eas env:push --environment preview --environment production --path .env --force`.
- La clave que firma el APK y los certificados de Apple los guarda EAS: cada APK nuevo se instala encima del anterior sin perder la sesión.
- `pnpm play` arma el AAB con el perfil `production` de EAS (variables de Firebase de `production`, número de versión automático) y deja el link para descargarlo. La clave de firma es la misma de los APK; Play agrega la suya al publicar (firma de apps de Google Play).
- La política de privacidad está en `https://<proyecto>.web.app/privacidad` (`public/privacidad.html`, sale con `pnpm desplegar hosting`) y se abre desde Crear cuenta y Mi cuenta: Play la pide en la ficha y dentro de la app.
- `pnpm testflight` arma la versión de iPhone y la sube a App Store Connect. La primera vez pide iniciar sesión con el Apple ID (con el código de verificación) para crear los certificados. Después, en App Store Connect → TestFlight: grupo externo, link público y revisión de Apple de la primera versión. Cada build de TestFlight dura 90 días.

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

3. Entrá a la app con ese email y contraseña, desde el mismo "Iniciar sesión" que usan todos.

Para sumar otro admin más adelante, repetí estos pasos, o creale una cuenta de mozo o juez desde Ajustes > Equipo y cambiale el rol a Admin.

## Baja de cuenta

Google Play pide que quien crea una cuenta desde la app la pueda borrar desde la app y pedir la baja desde la web.

- En la app: Mi cuenta > Borrar mi cuenta. Pide la contraseña actual (Authentication exige un inicio de sesión reciente para borrar la cuenta) y una confirmación que avisa cuánto crédito se pierde. Lo hace `lib/bajaCuenta.ts`, en este orden: verifica la contraseña, borra `users/{uid}` (con la foto adentro), `jugadores/{uid}` y `relojes/{uid}` en una transacción (sin señal falla en el acto, no queda en cola) y al final la cuenta de Authentication. Si solo falla ese último paso, cierra la sesión y avisa: al volver a entrar, la app pide completar el registro y se puede borrar de nuevo.
- En la web: `https://<proyecto>.web.app/baja` (`public/baja.html`, sale con `pnpm desplegar hosting`). Explica cómo borrarla desde la app y a qué email escribir si no se puede entrar. Esa URL va en Play Console > Contenido de la app > Seguridad de los datos > Eliminación de cuentas.
- La cuenta de admin no se borra desde la app (el local quedaría sin admin) y tampoco una cuenta con el acceso quitado (borrar el perfil y volver a completarlo sería aprobarse sola). Esas, y los pedidos que llegan por email, se borran a mano desde la consola de Firebase: Authentication > el usuario > Borrar cuenta; Firestore > `users/{uid}`, `jugadores/{uid}` y `relojes/{uid}`.

Qué queda: el historial del local, sin datos de contacto. Los torneos guardan el nombre y el uid de quienes jugaron (en `jugadores`, `rondas`, `posiciones`, `premios`, `entregas` y `reportes`) y no se tocan, porque las tablas, el ranking y el historial de los demás jugadores dependen de esos resultados. Las ventas guardan en `creditoUid` el uid de quien usó crédito, sin nombre ni email, y son inmutables (es la caja del local). Con la cuenta borrada, ese uid ya no lleva a ningún perfil ni email. Bloquear o desactivar una cuenta no cuenta como baja para Google: la baja borra.

## Configuración inicial del local

Nada del negocio está fijo en el código: todo sale de Firestore y se edita desde la app con la cuenta de admin.

- Ajustes: nombre del local, logo, turnos, alerta de stock, rubros de cafetería, valores por defecto de los torneos (rondas, minutos, tiempo extra, inscripción, cupo), juegos que se ofrecen al crear un torneo, medios de pago que aparecen al cobrar, temporada del ranking y los interruptores de reporte de resultados por el jugador, premios con crédito y descuento de stock al cobrar. Se guarda en `config/publico`. Mientras no exista, la app usa los valores por defecto de `lib/config.ts`.
- Turnos: definen la jornada de caja. Si un turno cruza la medianoche (por ejemplo 15:00 a 00:30), lo cobrado después de las 00:00 cuenta para el día en que empezó el turno, así el cierre de la noche no se parte en dos fechas.
- Personalización: solo nombre y logo, desde "Editar" en Ajustes. Los colores son los de Duel y cada persona elige día, noche o automático (sigue al teléfono) en Mi cuenta.
- Salón: salas y mesas (de café o de duelo) con su posición en el plano.
- Stock: productos de cada rubro e ingresos de mercadería. Los rubros de cafetería los define el local (por defecto Café y Pastelería); TCG y Servicios (alquiler, agua) son fijos de la app. Un producto de cafetería puede cambiar de rubro desde su ficha, y quitar un rubro de Ajustes no borra sus productos.

### Sumar mozos y jueces

1. Con la cuenta de admin, andá a Ajustes > Equipo > Sumar al equipo.
2. Elegí Mozo o Juez y cargá nombre, email y una contraseña de al menos 8 caracteres. La cuenta queda creada y aprobada.
3. Pasale a esa persona el email y la contraseña. Entra por "Iniciar sesión" como cualquiera y después la cambia en Mi cuenta.

Si el email ya tiene cuenta de jugador (alguien que juega en el local y empieza a trabajar), Equipo ofrece pasar esa misma cuenta a mozo o juez: entra con su contraseña de siempre y conserva su historial y su crédito.

Sin backend propio, la cuenta de Authentication la crea el teléfono del admin en una sesión aparte (así no se le cierra la suya) y el perfil lo escribe el admin; las reglas de Firestore solo le permiten a él crear perfiles de mozo o juez. Si el perfil no se llega a guardar, la app borra la cuenta recién creada para que se pueda reintentar con el mismo email.

Las solicitudes pendientes de cuando mozo y juez se registraban solos con un código de invitación siguen apareciendo en Equipo para aprobarlas o rechazarlas. El documento `config/privado`, donde se guardaba ese código, ya no se usa: se puede borrar desde la consola.

## Modelo de datos

Colecciones de Firestore (contrato completo en `lib/pedido.ts`, `lib/torneo.ts`, `lib/config.ts` y `lib/users.ts`). Las reglas rechazan campos que no estén en este contrato.

| Colección | Campos | Notas |
| --- | --- | --- |
| `config/publico` | `nombreLocal`, `logoUrl`, `turnos`, `alertaStock`, `torneo`, `temporada` (`nombre`, `inicio`, `inicioMs`), `reporteJugador`, `creditoPremio`, `descontarStock`, `juegos`, `mediosPago`, `rubrosCafeteria` | Lectura pública (el splash la usa antes del login). |
| `users/{uid}` | `uid`, `nombre`, `email` (en minúsculas), `role` (`admin`, `mozo`, `juez`, `jugador`), `estadoAprobacion` (`pendiente`, `aprobado`, `rechazado`), `creadoPor?` (el admin que creó la cuenta de mozo o juez), `emailVerificado?`, `fotoUrl?`, `creadoEn` | Privado: el propio usuario y el admin. El ID es el UID de Authentication. |
| `jugadores/{uid}` | `uid`, `nombre`, `nombreBusqueda` (minúsculas, sin tildes), `creditoCafeteria`, `ultimaVenta?`, `ultimoPremio?`, `activo?`, `fotoUrl?`, `creadoEn` | Directorio público para el staff: buscar jugadores y mover crédito sin ver emails. Se crea con el alta del jugador (o solo, al abrir la app, si faltaba). |
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

Fotos de perfil y logo: una JPEG chica guardada como data URL (`data:image/jpeg;base64,…`) en `users/{uid}.fotoUrl` y `jugadores/{uid}.fotoUrl` (200 px de ancho, hasta 100.000 caracteres) y en `config/publico.logoUrl` (480 px, hasta 250.000). La app las achica antes de guardarlas (`lib/avatar.ts`, `lib/logo.ts`) y las reglas controlan formato y tamaño con los mismos topes que `lib/imagenEnLinea.ts`. No usan Storage porque el plan gratis de Firebase ya no lo incluye. Las URLs de Storage de versiones anteriores se siguen aceptando.

## Seguridad

"Aprobado" significa `estadoAprobacion == 'aprobado'` en el perfil. "Staff" es admin, mozo o juez aprobado. Todo lo que no figura acá está denegado.

| Recurso | Leer | Escribir |
| --- | --- | --- |
| `config/publico` | Todos, incluso sin sesión | Admin; el logo, solo la JPEG chica (o una URL `https://`) |
| `users` | Cada uno el suyo; admin todos | Alta: el propio usuario, solo como jugador aprobado; el admin, mozos y jueces aprobados con `creadoPor` igual a su uid (nunca otro admin). Edición: el usuario solo su nombre, su foto, marcar su email verificado (si el token lo confirma) o pasar su cuenta vieja a jugador; admin rol, aprobación y nombre. Baja: el propio usuario (salvo el admin y una cuenta con el acceso quitado); el admin, la de los demás |
| `jugadores` | Cada jugador el suyo; staff todos | Alta: el propio jugador aprobado, con crédito 0, en el mismo batch que su perfil; también el juez o el admin, para jugar los torneos que manejan. Foto: cada uno la suya, solo la JPEG chica (o una URL de Storage de versiones anteriores). Edición: el jugador solo su nombre; el juez acredita solo al entregar un premio de un torneo cerrado, al ganador de ese puesto, por el monto del premio (hasta $1.000.000) y una sola vez (`ultimoPremio` + registro en `entregas`); el mozo descuenta solo junto con la venta que aplica ese crédito (`ultimaVenta`); el admin puede corregir a mano, con tope, y bloquear o reactivar (`activo`); nunca queda en negativo. Baja: el propio jugador, solo junto con su perfil (en la misma escritura); admin |
| `salas` | Staff | Admin |
| `mesas` | Staff | Admin; el mozo solo cambia `pedido` y `estado` |
| `productos`, `tcg_productos` | Staff | Admin; mozo y juez solo bajan `stock`, hasta 1.000 por vez y sin pasar de -1.000 |
| `ventas` | Admin y mozo; el jugador, las que usaron su crédito | Alta: admin y mozo, a su nombre, con la fecha de hoy (o la jornada abierta); si aplica crédito, descuenta ese mismo monto al jugador en la misma escritura. Nunca se editan ni se borran |
| `ingresos` | Admin | Alta: admin, con la fecha de hoy. Nunca se editan ni se borran |
| `torneos` | Cualquier usuario aprobado | Admin y juez, con la fecha de hoy, sin posiciones y tomando el candado en la misma escritura; borrar solo admin. Cerrado el torneo, el juez solo actualiza los premios existentes (no agrega puestos) |
| `torneos/{id}/entregas` | Staff | Admin y juez, una por puesto, cuando el premio pasa a entregado. Nunca se editan; borra solo el admin |
| `reportes` | Cualquier usuario aprobado | El jugador sentado en esa mesa de la ronda actual del torneo en curso, si el local permite que los jugadores reporten; borrar admin y juez |
| `bloqueos/torneo` | Admin y juez | Admin y juez, con la hora del servidor: se toma solo si el torneo anterior terminó (o ya no existe) y se libera al cerrarlo. El admin puede destrabarlo |
| `relojes/{uid}` | El propio usuario | El propio usuario, solo con la hora del servidor; borrarlo, el propio usuario |

Las fechas de ventas, ingresos y torneos tienen que ser las de la jornada en curso: el día argentino (UTC-3) más 6 horas para la madrugada de un turno nocturno.

Nadie puede crearse como admin ni registrarse solo como mozo o juez, aprobarse solo, cambiarse el rol, inflar un crédito o vaciarlo sin un premio o una venta que lo respalde, acreditar dos veces el mismo premio, editar o borrar ventas, leer los emails de otros, cargar un torneo retroactivo, reportar resultados en nombre de otro jugador ni borrar la cuenta de otro (o la propia para salir de un bloqueo). Los tests de `firestore-tests/` cubren cada uno de esos casos.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm start` | Levanta Expo (`expo start`). |
| `pnpm desplegar [partes]` | Sube reglas e índices al proyecto del `.env`; `pnpm desplegar hosting` publica la versión web. |
| `pnpm apk` / `pnpm play` / `pnpm testflight` | APK para Android con link de descarga / AAB para Google Play / versión de iPhone a TestFlight. Ver [Distribución](#distribución). |
| `pnpm firebase <comando>` | Firebase CLI 15 sin instalarla global (login, deploy). |
| `pnpm typecheck` | Chequeo de tipos con `tsc --noEmit`. |
| `pnpm test` | Tests unitarios con Jest (preset `jest-expo`). |
| `pnpm qa` | Tipos y tests unitarios, lo mismo que debería pasar antes de cada commit. |
| `pnpm test:rules` | Levanta el emulador de Firestore y corre `firestore-tests/` contra `firestore.rules`. Necesita Java 21 o superior en el `PATH`. |
| `pnpm qa:ui` | Prueba la app entera en un navegador, rol por rol: botones, diseño en 8 tamaños de pantalla, modo noche, velocidad y fluidez. Ver [QA de interfaz](#qa-de-interfaz). |

Los tests de reglas usan el proyecto ficticio `demo-duel` (el prefijo `demo-` es el que los emuladores reservan para eso), así que no tocan ningún proyecto real ni necesitan credenciales.

## QA de interfaz

`pnpm qa:ui` levanta los emuladores de Firebase con datos de prueba (un local con mesas, carta, ventas de la semana, un torneo en curso y dos cerrados, y una cuenta por rol), arma la versión web apuntando a ellos y la recorre en Edge o Chrome sin ventana. No toca el proyecto de Firebase del `.env`. Necesita Java 21 o superior, como `pnpm test:rules`.

En cada pantalla de cada rol:

- Diseño, en 8 tamaños (de un iPhone SE de 320 px a un iPad, y un iPhone acostado) y en modo noche: botones que se salen de la pantalla, quedan tapados, se pisan o no se alcanzan con scroll; scroll de costado; textos cortados; letra de menos de 10 px; contraste menor a 4,5:1; fuentes que no son las de Duel; imágenes rotas.
- Botones: toca cada uno y mira si cambió algo en pantalla y cuánto tardó. Las confirmaciones se cancelan y "Cerrar sesión" no se toca.
- Velocidad y fluidez, con el procesador frenado 4 veces (como un celular de gama media): tiempo de carga, bloqueos, saltos de diseño y cuadros lentos al scrollear.
- Errores de la consola y pedidos de red fallidos.

Deja el reporte en `qa-reporte/index.html` (capturas de cada pantalla en cada tamaño, problemas y tiempos) y termina con error si encontró algún error (los avisos, como poco contraste, letra chica, textos cortados, botones sin efecto o carga lenta, quedan en el reporte pero no hacen fallar la corrida). Tarda unos 15 minutos; para una pasada corta:

```bash
pnpm qa:ui --rapido                  # 3 tamaños y sin tocar botones
pnpm qa:ui --sector admin,mozo       # solo esos roles (sin-sesion, admin, juez, mozo, jugador)
pnpm qa:ui --pantalla hoy,stock      # solo esas pantallas
pnpm qa:ui --sin-build               # reusa la versión web de la corrida anterior
```

Lo que tiene que ver una persona con el celular en la mano está en [docs/pruebas-por-rol.md](docs/pruebas-por-rol.md): la lista de cada sector para probar antes de cada versión.

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
firestore.indexes.json
firestore-tests/     Tests de reglas contra los emuladores
scripts/qa/          QA de interfaz (pnpm qa:ui): datos de prueba, recorrido y reporte
docs/                Lista de pruebas por rol y guía de Google Play (textos, formularios e imágenes)
```
