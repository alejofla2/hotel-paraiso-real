const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');

if (fs.existsSync(path.join(__dirname, '.env'))) {
  process.loadEnvFile(path.join(__dirname, '.env'));
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataDirectory = path.join(__dirname, 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const db = new DatabaseSync(path.join(dataDirectory, 'hotel.sqlite'));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY,
    document TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('Sencilla', 'Doble', 'Familiar', 'Suite')),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    price_per_night INTEGER NOT NULL CHECK (price_per_night >= 0),
    status TEXT NOT NULL DEFAULT 'Disponible'
      CHECK (status IN ('Disponible', 'Reservada', 'Ocupada', 'Mantenimiento'))
  );
  CREATE TABLE IF NOT EXISTS meal_plans (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price_per_person_night INTEGER NOT NULL CHECK (price_per_person_night >= 0)
  );
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY,
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    meal_plan_id INTEGER NOT NULL REFERENCES meal_plans(id),
    meal_price_snapshot INTEGER NOT NULL,
    booked_at TEXT NOT NULL DEFAULT (datetime('now')),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    people INTEGER NOT NULL CHECK (people > 0),
    status TEXT NOT NULL DEFAULT 'Pendiente'
      CHECK (status IN ('Pendiente', 'Confirmada', 'Cancelada', 'Finalizada')),
    total INTEGER NOT NULL CHECK (total >= 0)
  );
  CREATE INDEX IF NOT EXISTS reservations_dates_idx ON reservations(room_id, check_in, check_out, status);
`);

const seedPassword = process.env.ADMIN_PASSWORD || 'Hotel2026!';
const seedEmail = (process.env.ADMIN_EMAIL || 'admin@paraisoreal.com').trim().toLowerCase();
const existingAdmin = db.prepare('SELECT id FROM users LIMIT 1').get();
if (!existingAdmin || process.env.ADMIN_PASSWORD) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(seedPassword, salt, 64).toString('hex');
  if (existingAdmin) {
    db.prepare('UPDATE users SET email = ?, password_hash = ?, password_salt = ? WHERE id = ?')
      .run(seedEmail, hash, salt, existingAdmin.id);
  } else {
    db.prepare('INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)')
      .run(seedEmail, hash, salt);
  }
}

const mealPlans = [
  ['Sin alimentación', 0],
  ['Desayuno', 25000],
  ['Media pensión', 45000],
  ['Pensión completa', 65000],
];
const insertMealPlan = db.prepare(
  'INSERT OR IGNORE INTO meal_plans (name, price_per_person_night) VALUES (?, ?)',
);
for (const plan of mealPlans) insertMealPlan.run(...plan);

const starterRooms = [
  ['101', 'Sencilla', 1, 120000],
  ['102', 'Doble', 2, 180000],
  ['201', 'Familiar', 4, 280000],
  ['301', 'Suite', 2, 380000],
  ['103', 'Sencilla', 1, 120000],
  ['104', 'Doble', 2, 180000],
  ['202', 'Familiar', 4, 280000],
  ['302', 'Suite', 2, 380000],
];
const insertRoom = db.prepare(
  'INSERT OR IGNORE INTO rooms (number, type, capacity, price_per_night) VALUES (?, ?, ?, ?)',
);
for (const room of starterRooms) insertRoom.run(...room);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(session({
  name: 'paraiso.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}

function validDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function hotelDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function listRooms() {
  const today = hotelDate();
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY number').all();
  const activeReservations = db.prepare(`
    SELECT room_id, status, check_in, check_out FROM reservations
    WHERE status IN ('Pendiente', 'Confirmada') AND check_out > ?
    ORDER BY check_in
  `).all(today);
  const reservationsByRoom = new Map();
  for (const reservation of activeReservations) {
    const list = reservationsByRoom.get(reservation.room_id) || [];
    list.push(reservation);
    reservationsByRoom.set(reservation.room_id, list);
  }

  return rooms.map((room) => {
    const roomReservations = reservationsByRoom.get(room.id) || [];
    const occupied = roomReservations.some((reservation) =>
      reservation.status === 'Confirmada' && reservation.check_in <= today && reservation.check_out > today);
    const reserved = roomReservations.length > 0;
    const status = room.status === 'Mantenimiento'
      ? 'Mantenimiento'
      : room.status === 'Ocupada'
        ? 'Ocupada'
        : occupied
          ? 'Ocupada'
          : reserved
            ? 'Reservada'
            : room.status;
    return { ...room, manual_status: room.status, status };
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function mailConfiguration() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function mailSenderAddress() {
  const sender = process.env.MAIL_FROM || process.env.SMTP_USER || '';
  return sender.match(/<([^>]+)>/)?.[1] || sender;
}

function createMailTransporter() {
  const portNumber = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: portNumber,
    secure: portNumber === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

function hotelLogoAttachment() {
  const logoPath = path.join(__dirname, 'public', 'images', 'hotel-paraiso-logo.png');
  return fs.existsSync(logoPath)
    ? [{ filename: 'hotel-paraiso-logo.png', path: logoPath, cid: 'hotel-paraiso-logo' }]
    : [];
}

async function sendReservationConfirmation(reservation) {
  if (!mailConfiguration()) {
    const error = new Error('El correo no está configurado. Completa SMTP_HOST, SMTP_USER y SMTP_PASS en .env.');
    error.status = 503;
    throw error;
  }

  const transporter = createMailTransporter();

  const fullName = `${reservation.first_name} ${reservation.last_name}`;
  const text = [
    `Hola ${fullName},`,
    '',
    `Tu reserva ${reservation.id} en el Hotel Paraíso Real ha sido confirmada.`,
    `Habitación: ${reservation.room_number} (${reservation.room_type})`,
    `Entrada: ${reservation.check_in}`,
    `Salida: ${reservation.check_out}`,
    `Personas: ${reservation.people}`,
    `Plan: ${reservation.meal_plan}`,
    `Total: ${Number(reservation.total).toLocaleString('es-CO')} COP`,
    '',
    '¡Te esperamos!',
  ].join('\n');

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: reservation.email,
    subject: `Confirmación de reserva #${reservation.id} - Hotel Paraíso Real`,
    text,
    attachments: hotelLogoAttachment(),
    html: `<div style="margin:0;padding:36px 12px;background:#f6f4f0;font-family:Arial,sans-serif;color:#193b47">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e9e3da">
        <div style="padding:20px;text-align:center;border-bottom:1px solid #eee8df">
          ${hotelLogoAttachment().length ? '<img src="cid:hotel-paraiso-logo" alt="Hotel Paraíso Real" style="width:92px;height:auto">' : '<strong style="letter-spacing:3px;color:#0c5961">HOTEL PARAÍSO REAL</strong>'}
        </div>
        <div style="padding:30px">
          <p style="font-size:11px;letter-spacing:2px;color:#b48645">CONFIRMACIÓN DE RESERVA</p>
          <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;color:#143c47">¡Te esperamos, ${escapeHtml(fullName)}!</h1>
          <p>Tu reserva <strong>#${reservation.id}</strong> ha sido confirmada.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#75828a">Habitación</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(reservation.room_number)} · ${escapeHtml(reservation.room_type)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#75828a">Entrada</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(reservation.check_in)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#75828a">Salida</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(reservation.check_out)}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#75828a">Huéspedes</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${reservation.people}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#75828a">Alimentación</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${escapeHtml(reservation.meal_plan)}</td></tr>
            <tr><td style="padding:14px 0;font-weight:bold">Total</td><td style="padding:14px 0;text-align:right;font-size:18px;font-weight:bold;color:#b48645">${Number(reservation.total).toLocaleString('es-CO')} COP</td></tr>
          </table>
          <p style="margin-top:24px;color:#667781">Gracias por elegirnos. Estamos preparando todo para recibirte.</p>
        </div>
        <div style="padding:16px;text-align:center;background:#123d47;color:#fff;font-size:11px">HOTEL PARAÍSO REAL · HOSPITALIDAD CON ENCANTO</div>
      </div>
    </div>`,
  });
}

app.post('/api/login', (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) return res.status(400).json({ error: 'Ingresa correo y contraseña.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const salt = user?.password_salt || 'invalid-user-salt';
  const expected = user
    ? Buffer.from(user.password_hash, 'hex')
    : crypto.scryptSync('invalid-password', salt, 64);
  const actual = crypto.scryptSync(password, salt, 64);
  if (!user || !crypto.timingSafeEqual(actual, expected)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'No fue posible iniciar la sesión.' });
    req.session.userId = user.id;
    return res.json({ email: user.email });
  });
});

app.post('/api/logout', requireLogin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('paraiso.sid');
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  const user = req.session.userId
    ? db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId)
    : null;
  res.json({
    user: user || null,
    emailConfigured: mailConfiguration(),
    senderEmail: mailSenderAddress(),
  });
});

app.get('/api/public/availability', (req, res) => {
  const { check_in: checkIn, check_out: checkOut } = req.query;
  const people = Number(req.query.people);
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn
    || checkIn < hotelDate()
    || !Number.isInteger(people) || people < 1 || people > 12) {
    return res.status(400).json({ error: 'Selecciona fechas futuras válidas y entre 1 y 12 huéspedes.' });
  }
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  if (nights > 365) return res.status(400).json({ error: 'La estadía no puede superar 365 noches.' });

  const availableRooms = db.prepare(`
    SELECT rm.* FROM rooms rm
    WHERE rm.status NOT IN ('Mantenimiento', 'Ocupada')
      AND rm.capacity >= ?
      AND NOT EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.room_id = rm.id
          AND r.status IN ('Pendiente', 'Confirmada')
          AND r.check_in < ? AND r.check_out > ?
      )
    ORDER BY rm.price_per_night, rm.number
  `).all(people, checkOut, checkIn);
  res.json({
    rooms: availableRooms,
    mealPlans: db.prepare('SELECT * FROM meal_plans ORDER BY id').all(),
  });
});

app.get('/api/dashboard', requireLogin, (req, res) => {
  const today = hotelDate();
  const roomCountsByStatus = new Map();
  for (const room of listRooms()) {
    roomCountsByStatus.set(room.status, (roomCountsByStatus.get(room.status) || 0) + 1);
  }
  const roomCounts = [...roomCountsByStatus].map(([status, count]) => ({ status, count }));
  const reservationCounts = db.prepare(`
    SELECT status, COUNT(*) AS count FROM reservations GROUP BY status
  `).all();
  const arrivals = db.prepare(`
    SELECT COUNT(*) AS count FROM reservations
    WHERE check_in = ? AND status = 'Confirmada'
  `).get(today).count;
  res.json({ roomCounts, reservationCounts, arrivals });
});

app.get('/api/rooms', requireLogin, (req, res) => {
  res.json(listRooms());
});

app.post('/api/rooms', requireLogin, (req, res) => {
  const { number, type, capacity, price_per_night: price } = req.body;
  if (!String(number || '').trim() || !['Sencilla', 'Doble', 'Familiar', 'Suite'].includes(type)
    || !Number.isInteger(Number(capacity)) || Number(capacity) < 1
    || !Number.isInteger(Number(price)) || Number(price) < 0) {
    return res.status(400).json({ error: 'Revisa número, tipo, capacidad y precio de la habitación.' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO rooms (number, type, capacity, price_per_night)
      VALUES (?, ?, ?, ?)
    `).run(String(number).trim(), type, Number(capacity), Number(price));
    res.status(201).json(listRooms().find((room) => room.id === Number(result.lastInsertRowid)));
  } catch (error) {
    if (error.errcode === 2067) {
      return res.status(409).json({ error: 'Ya existe una habitación con ese número.' });
    }
    throw error;
  }
});

app.patch('/api/rooms/:id/status', requireLogin, (req, res) => {
  const { status } = req.body;
  if (!['Disponible', 'Ocupada', 'Mantenimiento'].includes(status)) {
    return res.status(400).json({ error: 'Elige sin bloqueo manual, ocupada manualmente o mantenimiento. Las reservas se reflejan automáticamente.' });
  }
  const result = db.prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'No se encontró la habitación.' });
  res.json(listRooms().find((room) => room.id === Number(req.params.id)));
});

app.get('/api/meal-plans', requireLogin, (req, res) => {
  res.json(db.prepare('SELECT * FROM meal_plans ORDER BY id').all());
});

app.get('/api/reservations', requireLogin, (req, res) => {
  const reservations = db.prepare(`
    SELECT r.*, g.document, g.first_name, g.last_name, g.phone, g.email,
      rm.number AS room_number, rm.type AS room_type, mp.name AS meal_plan
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN rooms rm ON rm.id = r.room_id
    JOIN meal_plans mp ON mp.id = r.meal_plan_id
    ORDER BY r.booked_at DESC, r.id DESC
  `).all();
  res.json(reservations);
});

function createReservation(req, res, isPublic = false) {
  const {
    document, first_name: firstName, last_name: lastName, phone, email,
    room_id: roomId, meal_plan_id: mealPlanId, check_in: checkIn, check_out: checkOut, people,
  } = req.body;
  if (![document, firstName, lastName, phone, email].every((value) =>
    typeof value === 'string' && value.trim() && value.length <= 254)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn
    || (isPublic && checkIn < hotelDate())
    || !Number.isInteger(Number(people)) || Number(people) < 1 || (isPublic && Number(people) > 12)) {
    return res.status(400).json({ error: 'Revisa los datos del huésped, correo, fechas y número de personas.' });
  }

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(roomId));
  const mealPlan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(Number(mealPlanId));
  if (!room || !mealPlan) return res.status(400).json({ error: 'Selecciona una habitación y un plan válidos.' });
  if (Number(people) > room.capacity) {
    return res.status(400).json({ error: `La habitación ${room.number} tiene capacidad para ${room.capacity} persona(s).` });
  }
  if (room.status === 'Mantenimiento' || room.status === 'Ocupada') {
    return res.status(409).json({ error: `La habitación ${room.number} no está habilitada para reservar.` });
  }
  const overlap = db.prepare(`
    SELECT id FROM reservations
    WHERE room_id = ? AND status IN ('Pendiente', 'Confirmada')
      AND check_in < ? AND check_out > ?
  `).get(room.id, checkOut, checkIn);
  if (overlap) return res.status(409).json({ error: 'La habitación ya tiene una reserva en esas fechas.' });

  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000;
  if (nights > 365) return res.status(400).json({ error: 'La estadía no puede superar 365 noches.' });
  const total = nights * (room.price_per_night + mealPlan.price_per_person_night * Number(people));

  const insertReservation = db.prepare(`
    INSERT INTO reservations (guest_id, room_id, meal_plan_id, meal_price_snapshot, check_in, check_out, people, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE');
  let createdReservation;
  try {
    const conflictingReservation = db.prepare(`
      SELECT id FROM reservations
      WHERE room_id = ? AND status IN ('Pendiente', 'Confirmada')
        AND check_in < ? AND check_out > ?
    `).get(room.id, checkOut, checkIn);
    if (conflictingReservation) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'La habitación ya tiene una reserva en esas fechas.' });
    }
    const guestEmail = email.trim().toLowerCase();
    if (isPublic) {
      const existingGuest = db.prepare('SELECT email FROM guests WHERE document = ?').get(document.trim());
      if (existingGuest && existingGuest.email.toLowerCase() !== guestEmail) {
        db.exec('ROLLBACK');
        return res.status(409).json({
          error: 'Ya existe un huésped con ese documento. Usa el correo registrado o contacta al hotel.',
        });
      }
      db.prepare(`
        INSERT INTO guests (document, first_name, last_name, phone, email)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document) DO NOTHING
      `).run(document.trim(), firstName.trim(), lastName.trim(), phone.trim(), guestEmail);
    } else {
      db.prepare(`
        INSERT INTO guests (document, first_name, last_name, phone, email)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document) DO UPDATE SET
          first_name = excluded.first_name, last_name = excluded.last_name,
          phone = excluded.phone, email = excluded.email
      `).run(document.trim(), firstName.trim(), lastName.trim(), phone.trim(), guestEmail);
    }
    const guest = db.prepare('SELECT id FROM guests WHERE document = ?').get(document.trim());
    const result = insertReservation.run(
      guest.id, room.id, mealPlan.id, mealPlan.price_per_person_night,
      checkIn, checkOut, Number(people), total,
    );
    createdReservation = db.prepare(`
      SELECT r.*, g.document, g.first_name, g.last_name, g.phone, g.email,
        rm.number AS room_number, rm.type AS room_type, mp.name AS meal_plan
      FROM reservations r
      JOIN guests g ON g.id = r.guest_id
      JOIN rooms rm ON rm.id = r.room_id
      JOIN meal_plans mp ON mp.id = r.meal_plan_id
      WHERE r.id = ?
    `).get(Number(result.lastInsertRowid));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (isPublic) {
    return res.status(201).json({
      id: createdReservation.id,
      status: createdReservation.status,
      check_in: createdReservation.check_in,
      check_out: createdReservation.check_out,
      total: createdReservation.total,
    });
  }
  res.status(201).json(createdReservation);
}

app.post('/api/reservations', requireLogin, (req, res) => createReservation(req, res));
app.post('/api/public/reservations', (req, res) => createReservation(req, res, true));

app.delete('/api/reservations/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Identificador de reserva no válido.' });
  }

  const deleted = db.prepare("DELETE FROM reservations WHERE id = ? AND status IN ('Cancelada', 'Finalizada')").run(id);
  if (!deleted.changes) {
    const reservation = db.prepare('SELECT status FROM reservations WHERE id = ?').get(id);
    if (!reservation) return res.status(404).json({ error: 'No se encontró la reserva.' });
    return res.status(409).json({ error: 'Solo se pueden eliminar reservas canceladas o finalizadas.' });
  }
  res.status(204).end();
});

app.patch('/api/reservations/:id/status', requireLogin, async (req, res) => {
  const { status } = req.body;
  if (!['Confirmada', 'Cancelada', 'Finalizada'].includes(status)) {
    return res.status(400).json({ error: 'Estado de reserva no válido.' });
  }

  const reservation = db.prepare(`
    SELECT r.*, g.first_name, g.last_name, g.email,
      rm.number AS room_number, rm.type AS room_type, mp.name AS meal_plan
    FROM reservations r
    JOIN guests g ON g.id = r.guest_id
    JOIN rooms rm ON rm.id = r.room_id
    JOIN meal_plans mp ON mp.id = r.meal_plan_id
    WHERE r.id = ?
  `).get(Number(req.params.id));
  if (!reservation) return res.status(404).json({ error: 'No se encontró la reserva.' });
  const allowedTransitions = {
    Pendiente: ['Confirmada', 'Cancelada'],
    Confirmada: ['Finalizada'],
  };
  if (!allowedTransitions[reservation.status]?.includes(status)) {
    const message = reservation.status === 'Pendiente'
      ? 'Una reserva pendiente solo se puede confirmar o cancelar.'
      : reservation.status === 'Confirmada'
        ? 'Solo una reserva confirmada se puede finalizar.'
        : 'Esta reserva ya no admite cambios.';
    return res.status(409).json({ error: message });
  }

  if (status === 'Confirmada') {
    try {
      await sendReservationConfirmation(reservation);
    } catch (error) {
      console.error('No se pudo enviar la confirmación:', error.message);
      return res.status(error.status || 502).json({
        error: error.status === 503
          ? error.message
          : 'No se pudo enviar el correo. Verifica la configuración SMTP y vuelve a intentarlo.',
      });
    }
  }

  const updated = db.prepare('UPDATE reservations SET status = ? WHERE id = ? AND status = ?')
    .run(status, reservation.id, reservation.status);
  if (!updated.changes) {
    return res.status(409).json({ error: 'La reserva cambió mientras se procesaba. Actualiza la lista e inténtalo de nuevo.' });
  }
  res.json({ ...reservation, status });
});

app.use('/api', (error, req, res, next) => {
  console.error('Error en API:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Ocurrió un error interno. Revisa la consola del servidor.' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(port, () => {
  console.log(`Hotel Paraíso Real disponible en http://localhost:${port}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('Usando clave inicial de demostración. Define ADMIN_PASSWORD en .env antes de publicar.');
  }
  if (!mailConfiguration()) console.warn('Correo SMTP sin configurar: no se podrán confirmar reservas por email.');
});
