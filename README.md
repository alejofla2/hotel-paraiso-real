# Hotel Paraíso Real

Aplicación web para administrar huéspedes, habitaciones y reservas. La interfaz está en español y utiliza una base SQLite persistente en `data/hotel.sqlite`.

## Requisitos

- Node.js 22.5 o superior.
- npm.
- Una cuenta SMTP para enviar confirmaciones de correo electrónico.

## Instalación y ejecución

En PowerShell, desde la carpeta del proyecto:

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` y define `SESSION_SECRET` y una contraseña propia para `ADMIN_PASSWORD`. Para habilitar correos, completa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM`. Con Gmail, crea una contraseña de aplicación desde la configuración de seguridad de tu cuenta; no uses la contraseña normal de Gmail.

### Configurar confirmaciones con Gmail

1. En la cuenta `hotelparaiso554@gmail.com` activa la **verificación en dos pasos**.
2. Desde la sección **Contraseñas de aplicaciones** de la cuenta genera una contraseña para este proyecto.
3. La configuración local `.env` ya tiene la dirección `hotelparaiso554@gmail.com`, el servidor `smtp.gmail.com` y el puerto `587`. Pega la contraseña de aplicación en `SMTP_PASS`. No uses la contraseña normal de Gmail.
4. Guarda `.env`, detén el servidor con `Ctrl + C` y vuelve a ejecutar `npm start`.

Al confirmar una reserva desde el panel, el huésped recibe un correo con el logo, habitación, fechas, plan y total. Si el correo falla, la reserva permanece pendiente para poder reintentar.

Inicia la aplicación:

```powershell
npm start
```

Abre <http://localhost:3000>. Al iniciar, la aplicación crea la cuenta administradora con `ADMIN_EMAIL` y `ADMIN_PASSWORD`; si `ADMIN_PASSWORD` está definido, sincroniza la contraseña y el correo desde `.env`, incluso si la base de datos ya existía. Si no configuraste esas variables, la cuenta demostrativa es `admin@paraisoreal.com` con contraseña `Hotel2026!`; cámbiala antes de utilizar el sistema con datos reales.

Genera el informe PDF del taller con:

```powershell
npm run report
```

El archivo se crea en `entregables/Informe_Hotel_Paraiso_Real.pdf`. Completa en la portada los nombres de los tres estudiantes, institución, módulo, docente y ciudad antes de entregarlo.

Sin los datos SMTP la aplicación sigue permitiendo registrar reservas, pero no confirmarlas por correo. El panel indica si la configuración SMTP está presente.

## Funcionalidades

- Acceso y cierre de sesión para administración.
- Página pública del hotel con presentación, búsqueda por fechas y número de huéspedes; al buscar, solo muestra las categorías con habitaciones realmente disponibles y con capacidad suficiente para el grupo.
- Portada informativa con una tarjeta por categoría de habitación; su ficha presenta una galería y detalles referenciales de cama y baño, además de las habitaciones disponibles para las fechas elegidas. Incluye también opciones de alimentación, proceso de reserva, preguntas frecuentes y contacto por correo.
- Solicitudes públicas de reserva que quedan pendientes para revisión y confirmación por el administrador.
- Panel con resumen de habitaciones y reservas.
- El encabezado administrativo muestra la dirección configurada como remitente de las confirmaciones (MAIL_FROM o SMTP_USER), no el correo de acceso del administrador.
- Consulta, búsqueda y filtro de reservas.
- Eliminación permanente de reservas canceladas o finalizadas desde el panel, con confirmación; las reservas pendientes o confirmadas no se pueden eliminar.
- Registro de huésped y reserva, con cálculo de noches y valor total.
- Validación de capacidad y prevención de reservas superpuestas.
- Gestión de habitaciones y estados: disponible, reservada, ocupada o mantenimiento.
- Flujo de reservas: Pendiente → Confirmada → Finalizada; las pendientes también se pueden cancelar.
- Estado operativo de las habitaciones calculado automáticamente: las reservas vigentes o futuras aparecen como Reservada, una reserva confirmada que incluye la fecha de hoy aparece como Ocupada, y al cancelar o finalizar vuelve a reflejarse la disponibilidad según las demás estadías. Mantenimiento y bloqueos manuales tienen prioridad.
- Al confirmar una reserva se envía un correo al huésped con su estadía y el total. La reserva solo se confirma cuando el envío SMTP termina correctamente.
- Persistencia de habitaciones, huéspedes, planes, reservas y administrador en SQLite.

## Datos de demostración y supuestos de precio

Se crean ocho habitaciones de demostración, dos por categoría: sencillas 101 y 103, dobles 102 y 104, familiares 201 y 202, y suites 301 y 302. El inicio crea las habitaciones que falten sin reemplazar las existentes. Los precios están expresados en pesos colombianos (COP) y son valores demostrativos. Los planes de alimentación también tienen precios demostrativos por persona y noche:

| Plan | Precio por persona/noche |
|---|---:|
| Sin alimentación | COP 0 |
| Desayuno | COP 25.000 |
| Media pensión | COP 45.000 |
| Pensión completa | COP 65.000 |

El total se calcula como `(precio de habitación por noche + precio del plan por persona/noche × personas) × noches`. Los precios de planes se encuentran en `mealPlans` al inicio de `server.js`; el valor de cada habitación se registra al crearla desde la interfaz.

## Modelo de datos

- `users`: credenciales administrativas, almacenadas con derivación de clave scrypt y sal aleatoria.
- `guests`: documento único, nombres, teléfono y correo. Un huésped puede tener varias reservas.
- `rooms`: número, tipo, capacidad, tarifa y estado.
- `meal_plans`: catálogo de planes de alimentación y su precio por persona/noche.
- `reservations`: huésped, habitación, fechas, personas, estado y total. El precio del plan se copia en la reserva para conservar el cálculo histórico.

Relaciones: `guests 1:N reservations`, `rooms 1:N reservations` y `meal_plans 1:N reservations`.

## Correo de confirmación

El huésped solicita la habitación desde la página pública indicando sus datos y correo. El estado inicial es **Pendiente**. Al pulsar **Confirmar** en el panel administrativo, el servidor intenta entregar el mensaje usando SMTP; la reserva solo cambia a **Confirmada** si el envío termina correctamente. Si hay un error de conexión, autenticación o configuración, el sistema muestra el error y deja la reserva pendiente para permitir reintentar.

Las credenciales SMTP son secretos locales: no las compartas ni las subas al repositorio. La app solo informa si el correo está configurado; no expone la contraseña en el navegador.

## Límites de esta versión educativa

La sesión usa el almacén en memoria predeterminado de `express-session`; al reiniciar el servidor, los usuarios deberán iniciar sesión de nuevo. El proyecto está preparado para ejecución local y demostración académica; antes de publicarlo se recomienda configurar HTTPS, un almacén persistente para sesiones, una cuenta SMTP de producción y la rotación de credenciales.
