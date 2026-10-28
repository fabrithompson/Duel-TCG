# Google Play: qué cargar en Play Console

Paso a paso para publicar Duel con la cuenta personal de desarrollador. Los textos están listos para copiar. Las imágenes están en [`docs/google-play/`](google-play/).

## El logo

Play rechaza o suspende las apps que usan marcas de otros en el ícono o en las imágenes de la ficha. El logo de Duel (`assets/brand/duel-logo.svg`) tiene cartas con dorsos propios, sin nombres ni logos de juegos. Ojo si se cambia: el anterior tenía una carta de Pokémon y no se podía publicar con él.

Del SVG salen `assets/icon.png`, `assets/adaptive-icon.png`, `assets/favicon.png`, `assets/brand/duel-logo.png` y los íconos de `public/`. El ícono de 512 × 512 de la ficha es `public/icono-512.png`.

## 0. Antes de empezar

1. Publicá la web, que tiene las dos páginas que pide Play. Desde `C:\Users\fabri\Duel-TCG`:

   ```
   pnpm.cmd desplegar
   pnpm.cmd desplegar hosting
   ```

   Revisá que abran:
   - Política de privacidad: https://duel-f33f0.web.app/privacidad
   - Baja de cuenta: https://duel-f33f0.web.app/baja

2. Creá una cuenta de jugador para que la revise Google: en la app, Crear cuenta, con un email que no sea de nadie del local (por ejemplo `revision.play@otempresa.com`) y una contraseña nueva. Si querés que vean más que la pantalla vacía, anotala en un torneo de prueba.
3. Armá el paquete para Play (tarda unos 15 minutos en la nube de Expo):

   ```
   pnpm.cmd play
   ```

   Al terminar deja un link de expo.dev: de ahí se descarga el `.aab`.

## 1. Crear la app

Play Console → Crear app:

| Campo | Qué poner |
| --- | --- |
| Nombre de la app | `Duel: torneos TCG y café` |
| Idioma predeterminado | Español (Latinoamérica) – es-419 |
| App o juego | App |
| Gratis o pagada | Gratis |
| Declaraciones | Tildá las dos (políticas del programa y leyes de exportación de EE. UU.) |

## 2. Configurar la app (Panel → "Configura tu app")

### Política de privacidad

`https://duel-f33f0.web.app/privacidad`

### Acceso a la app

"Toda la funcionalidad o parte de ella está restringida" → Agregar instrucciones:

- Nombre: `Cuenta de jugador`
- Usuario: el email de la cuenta de revisión del paso 0
- Contraseña: la de esa cuenta
- Instrucciones: `Tocá "Iniciar sesión" y entrá con estos datos. Es una cuenta de jugador: ve Mi duelo, Historial, Tabla y Mi cuenta. Las cuentas del personal del café las crea la administración del local.`

### Anuncios

No, la app no contiene anuncios.

### Clasificación del contenido

- Email de contacto: `otempresa@otempresa.com`
- Categoría: "Todos los demás tipos de apps" (no es un juego ni una red social).
- Violencia, sexo, lenguaje, drogas, apuestas (reales o simuladas): **No** a todo. Los torneos son de juegos de cartas en el local; la app no tiene apuestas ni premios en dinero.
- ¿Los usuarios pueden interactuar o comunicarse? **No**: no hay chat ni mensajes. Si pregunta si comparte información personal con otros usuarios: **Sí** (el nombre aparece en los torneos y en la tabla; el personal del local ve nombre y foto).
- ¿Comparte la ubicación? **No**. ¿Compras digitales dentro de la app? **No**.

### Público objetivo

- Edades: **13 a 15, 16 a 17 y 18 o más**. No marques menores de 13: eso activa los requisitos de apps para familias.
- ¿Podría atraer a niños? **No**.

### Seguridad de los datos

**Recopilación y seguridad**

| Pregunta | Respuesta |
| --- | --- |
| ¿Recopila o comparte datos del usuario? | Sí |
| ¿Están encriptados en tránsito? | Sí |
| Formas de crear la cuenta | Nombre de usuario y contraseña |
| URL para borrar la cuenta | `https://duel-f33f0.web.app/baja` |
| ¿Se pueden borrar datos sin borrar la cuenta? | Sí (la foto desde Mi cuenta; lo demás, pidiéndolo por email) |

**Tipos de datos.** Para todos: recopilado **sí**, compartido **no** (Firebase es un proveedor de servicios y no cuenta como compartir), procesado de forma efímera **no**.

| Tipo de dato | ¿Obligatorio? | Para qué |
| --- | --- | --- |
| Información personal → Nombre | Obligatorio | Funcionalidad de la app, Administración de la cuenta |
| Información personal → Dirección de correo electrónico | Obligatorio | Administración de la cuenta |
| Información personal → IDs de usuario | Obligatorio | Funcionalidad de la app, Administración de la cuenta |
| Información financiera → Historial de compras | Obligatorio | Funcionalidad de la app (las compras del café pagadas con crédito) |
| Información financiera → Otra información financiera | Obligatorio | Funcionalidad de la app (el saldo de crédito de cafetería) |
| Fotos y videos → Fotos | Opcional | Funcionalidad de la app (foto de perfil) |
| Actividad en la app → Otras acciones | Obligatorio | Funcionalidad de la app (inscripciones y resultados de torneos) |

No marques: ubicación, contactos, mensajes, audio, archivos, calendario, salud, historial web, IDs del dispositivo ni registros de fallas (la app no usa nada de eso).

### Apps gubernamentales, funciones financieras y salud

- App gubernamental: **No**.
- Funciones financieras: **"Mi app no ofrece ninguna función financiera"** (el crédito es un saldo del café, no un servicio financiero).
- Salud: **No**.

### Categoría y datos de contacto (Ficha de Play Store → Configuración de la tienda)

- Tipo: App. Categoría: **Eventos**.
- Email: `otempresa@otempresa.com`.

## 3. Ficha de Play Store

**Nombre** (máx. 30): `Duel: torneos TCG y café`

**Descripción breve** (máx. 80):

```
Torneos de cartas, mesas y caja del café: cada uno ve solo lo suyo.
```

**Descripción completa:**

```
Duel es la app del café que organiza torneos de juegos de cartas (TCG). Junta en un solo lugar los torneos en vivo y la operación del local.

Si jugás:
• Creá tu cuenta en un minuto y entrá con tu email.
• En Mi duelo ves tu mesa, tu rival y el reloj de la ronda.
• Reportá tu resultado desde el celular (si el local lo permite).
• Seguí la tabla de la temporada y tu historial de torneos.
• Mirá tu crédito de cafetería ganado en premios y en qué lo usaste.

Si trabajás en el local:
• Jueces: crean torneos, arman las rondas con emparejamientos automáticos, manejan el reloj, cargan resultados y entregan premios.
• Mozos: toman pedidos por mesa, cobran con cualquier medio de pago y descuentan el crédito de los jugadores.
• Administración: stock de cafetería y TCG, ingresos de mercadería, cierre de caja, equipo y ajustes del local.

Sin publicidad. Podés borrar tu cuenta cuando quieras desde Mi cuenta.
```

**Gráficos** (en `docs/google-play/`):

| Qué | Archivo |
| --- | --- |
| Ícono de la app (512 × 512) | `public/icono-512.png` |
| Gráfico de funciones (1024 × 500) | `grafico-destacado.png` |
| Capturas de teléfono (de 2 a 8) | `captura-1-mi-duelo.png` … `captura-5-salon.png` |

Las capturas se armaron con los datos de prueba de `pnpm qa:ui`: las personas son inventadas, y los juegos y productos con marca se cambiaron por nombres genéricos.

## 4. Prueba cerrada (obligatoria para cuentas personales nuevas)

Play pide que una cuenta personal nueva haga una prueba cerrada antes de publicar para todos. La última vez que lo vimos eran **al menos 12 testers durante 14 días seguidos**; confirmalo en el panel, porque Google lo cambió más de una vez.

1. Probar y publicar → Pruebas → **Prueba cerrada** → Crear segmento (o usar "Alpha").
2. Testers: creá una lista de emails (las cuentas de Google con las que tienen Play Store en el celular).
3. Crear versión → subí el `.aab` del paso 0 → Notas de la versión: `Primera versión de Duel.`
4. Países: Argentina.
5. Enviá la versión a revisión. Cuando la aprueben, pasales a los testers el link para unirse a la prueba ("Copiar link"): cada uno lo abre, acepta y la instala desde Play Store.
6. Que la usen y la mantengan instalada los 14 días.

## 5. Producción

Cuando el panel lo habilite, "Solicitar acceso a producción": responde un cuestionario sobre cómo fue la prueba. Con el acceso aprobado, Producción → Crear versión → el mismo `.aab` (o uno nuevo con `pnpm.cmd play`) → Países → Enviar a revisión.

Cada actualización después: `pnpm.cmd play`, subir el `.aab` nuevo a la pista que corresponda. EAS sube el número de versión solo.
