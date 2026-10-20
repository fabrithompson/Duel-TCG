# Pruebas por rol

Lista para probar la app a mano, sector por sector, antes de cada versión. Lo automático (botones que responden, diseño en 8 tamaños de pantalla, modo noche, velocidad y fluidez) lo cubre `pnpm qa:ui`: esta lista es para lo que tiene que ver una persona con el celular en la mano.

Cómo usarla:

- Probá cada rol con su propia cuenta y, si se puede, en dos celulares a la vez (por ejemplo, mozo y admin), así se ve que lo que hace uno le llega al otro.
- Marcá `[x]` lo que anduvo. Si algo falla, anotá qué tocaste, qué esperabas y qué pasó, con captura de pantalla.
- Hacé una pasada en un iPhone chico (SE o mini) y otra en uno grande, una de día y otra de noche (Mi cuenta > Tema).

## Sin sesión

- [ ] La pantalla de inicio muestra el logo una sola vez, con "Iniciar sesión" y "Crear cuenta".
- [ ] Crear cuenta de jugador: entra al instante y cae en Mi duelo.
- [ ] Crear cuenta de mozo o juez: pide el código de invitación y avisa que queda pendiente. Con un código vencido o mal escrito, no deja.
- [ ] Con la cuenta pendiente, iniciar sesión no deja entrar hasta que el admin la aprueba.
- [ ] Iniciar sesión con cada perfil (mozo, juez, jugador) y con "Entrar con cuenta de administración".
- [ ] Elegir un perfil que no es el de la cuenta da un aviso claro, no un error raro.
- [ ] "¿Olvidaste tu contraseña?" manda el mail (revisá también la carpeta de spam).
- [ ] La app recuerda el último perfil al volver a abrirla.

## Admin

### Hoy
- [ ] Las tres tarjetas (caja del día, mesas, ronda) muestran números reales. Caja del día lleva a Caja y Mesas al Salón.
- [ ] Pendientes: stock bajo, resultados sin cargar, premios sin entregar, mesas con cuenta abierta y cuentas de staff esperando. Cada uno lleva a donde se resuelve.
- [ ] "Ahora en el local" muestra los últimos cobros con hora y medio de pago.

### Salón
- [ ] Cambiar de sala, crear una sala nueva y renombrarla (mantener apretado).
- [ ] "+ Mesa": agregar mesas de café y de duelo, moverlas arrastrando y editarlas o eliminarlas (mantener apretado).
- [ ] Una mesa ocupada o con un duelo en curso no se puede eliminar.
- [ ] Los colores de mesa libre, con consumo y en duelo coinciden con la leyenda.

### Pedido de mesa
- [ ] Sumar productos de cada rubro, cambiar cantidades con − y + y guardar.
- [ ] Cobrar con cada medio de pago activo en Ajustes. Sin elegir medio, no se puede confirmar.
- [ ] Usar el crédito de un jugador: descuenta lo justo y queda en la caja como crédito de torneo.
- [ ] Con "Cobrar descuenta stock" activo, lo vendido baja del stock.
- [ ] Dos celulares en la misma mesa: si uno cobra, el otro avisa y no cobra dos veces.

### Caja
- [ ] El total del día coincide con la suma de los cobros.
- [ ] "‹ Anterior" muestra días anteriores. Un turno que cruza la medianoche no parte el día en dos.
- [ ] Por rubro y por medio de pago suman lo mismo que el total. Las inscripciones de torneo aparecen aparte.

### Torneo
- [ ] Nuevo torneo: juego y formato (suizo, eliminación, suizo + top cut, casual), reglas, inscriptos y premios.
- [ ] "Juego yo también" suma al admin como jugador.
- [ ] Con un torneo en curso, no deja armar otro.
- [ ] Reloj: pausar, reanudar y +3 min. Se ve igual en todos los celulares y en Modo TV.
- [ ] Cargar resultados de cada mesa y cerrar la ronda. El emparejamiento siguiente tiene sentido.
- [ ] Cerrar el torneo: posiciones finales y premios asignados.
- [ ] Modo TV: reloj, mesas y podio, también acostado.
- [ ] "Premios" del encabezado lleva a Premios (el admin no tiene esa pestaña abajo).

### Premios
- [ ] Mientras el torneo está en juego, no aparece "Entregar".
- [ ] Al cerrar: entregar cada puesto, con producto y crédito. El crédito le llega al jugador.
- [ ] El mismo premio no se entrega dos veces.
- [ ] Inscripciones: marcar "Pagó" y ver lo cobrado y lo que falta.

### Stock
- [ ] Filtros por rubro. Solo los productos con stock bajo dicen "Stock bajo".
- [ ] "+ Ingreso": de un producto existente y de uno nuevo. El stock sube.
- [ ] "+ Servicio" (alquiler de mesa, agua): se cobra en el pedido sin descontar stock.
- [ ] Ficha del producto: cambiar precio, rubro, aviso de stock, pausar y eliminar.

### Ajustes
- [ ] Solo quedan nombre y logo como personalización. No hay color de marca ni modo noche del local.
- [ ] "Editar": cambiar el nombre del local, cargar un logo propio y volver al de Duel.
- [ ] Turnos: agregar, quitar y cambiar horarios. Turnos superpuestos no se guardan.
- [ ] Stock: aviso de stock bajo y rubros de cafetería (agregar y quitar).
- [ ] Torneos: rondas, minutos, tiempo extra, inscripción, cupo, reportes de jugadores, premios con crédito y juegos. Un torneo nuevo arranca con esos valores.
- [ ] Cobro: descontar stock y medios de pago (tiene que quedar al menos uno).
- [ ] Temporada: cambiar el nombre y empezar una nueva. La Tabla arranca de cero y el historial sigue.

### Equipo
- [ ] Código de invitación: generar, compartir y ver hasta cuándo sirve.
- [ ] Aprobar y rechazar solicitudes de mozo y juez.
- [ ] Cambiar el rol de alguien del equipo. Si tiene la app abierta, le cambia la pantalla y le avisa.
- [ ] Tocar un jugador lo bloquea (pide confirmación). "Reactivar" lo devuelve. El bloqueado no puede entrar.

### Mi cuenta
- [ ] Foto de perfil: agregar, cambiar y quitar.
- [ ] Cambiar el nombre: "Guardar nombre" aparece solo si lo cambiaste.
- [ ] Cambiar contraseña: los campos aparecen al tocar el botón. Con la actual mal escrita da un error claro.
- [ ] Tema: automático (sigue al teléfono), día y noche.
- [ ] Cerrar sesión pide confirmación y vuelve al inicio.

## Mozo

- [ ] Ve solo Hoy, Salón y Stock (y su cuenta). No ve Torneo, Ajustes ni la caja.
- [ ] Hoy: mesas con cuenta abierta y stock bajo. La caja del día no lleva a la pantalla de Caja.
- [ ] Salón: abrir mesas y tomar pedidos. No puede crear, mover ni borrar mesas.
- [ ] Pedido: cargar, guardar y cobrar con cada medio de pago y con crédito de jugador.
- [ ] Stock cafetería: solo consulta, sin "+ Ingreso".
- [ ] Mi cuenta: foto, nombre, contraseña, tema y cerrar sesión.

## Juez

- [ ] Ve Hoy, Torneo, Premios y Stock TCG. No ve Salón, Caja ni Ajustes.
- [ ] Hoy: estado del torneo, resultados por cargar y premios por entregar.
- [ ] Torneo: crear, correr rondas, reloj, cargar resultados, cerrar ronda y torneo, Modo TV. El encabezado no repite "Premios" (está en la barra de abajo).
- [ ] "Juego yo también": el juez juega su propio torneo y le aparece en su cuenta si gana crédito.
- [ ] Premios: entregar y marcar inscripciones pagas. Con el torneo cerrado, las inscripciones las marca solo el admin.
- [ ] Stock TCG: solo los productos de TCG.
- [ ] Mi cuenta: igual que el mozo, más el crédito si ganó un premio.

## Jugador

- [ ] Ve Mi duelo, Historial y Tabla.
- [ ] Sin torneo: Mi duelo dice que no está jugando y lleva al historial.
- [ ] En un torneo: mesa, rival, puntajes y reloj de la ronda.
- [ ] Reportar el resultado (si está activo en Ajustes). Si coincide con el rival, espera al juez. Si no coincide, decide el juez.
- [ ] Cuando el juez confirma, se ve el resultado y la ronda siguiente.
- [ ] Crédito en la barra: muestra el monto ganado y en Mi cuenta los usos.
- [ ] Historial: torneos jugados, puesto y premio.
- [ ] Tabla: ranking de la temporada con su fila resaltada.

## Entre roles

- [ ] Juez arma el torneo, el jugador ve su mesa en Mi duelo y la mesa de duelo aparece en el Salón del mozo.
- [ ] Jugador reporta, el juez lo ve, confirma y el jugador ve el resultado.
- [ ] Juez entrega un premio con crédito, el jugador lo ve en su cuenta y el mozo se lo descuenta al cobrar.
- [ ] Mozo cobra, el admin lo ve al instante en Hoy y en Caja.
- [ ] Admin cambia algo en Ajustes (medios de pago, juegos) y el mozo o el juez lo ven sin reiniciar la app.
- [ ] Admin bloquea a un jugador o le cambia el rol a alguien con la app abierta, y la sesión de esa persona se corta o cambia.

## En cualquier rol

- [ ] Sin internet: la app avisa y no pierde lo que estabas cargando. Al volver la señal, sigue.
- [ ] Cerrar y abrir la app mantiene la sesión.
- [ ] Rotar el celular: todo se sigue viendo bien (Modo TV se ve mejor acostado).
- [ ] Letra grande del sistema (Ajustes del iPhone > Pantalla y brillo > Tamaño del texto): nada se corta ni se pisa.
- [ ] VoiceOver: los botones se anuncian con su nombre.
