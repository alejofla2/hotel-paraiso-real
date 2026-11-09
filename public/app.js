const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
const statusClass = {
  Pendiente: 'pendiente',
  Confirmada: 'confirmada',
  Cancelada: 'cancelada',
  Finalizada: 'finalizada',
  Disponible: 'disponible',
  Reservada: 'confirmada',
  Ocupada: 'ocupada',
  Mantenimiento: 'mantenimiento',
};

let rooms = [];
let plans = [];
let reservations = [];
let toastTimer;
let publicAvailability = { rooms: [], mealPlans: [] };
let publicDates = { check_in: '', check_out: '', people: 2 };
let selectedPublicRoom;
const publicRoomTypes = {
  Sencilla: {
    tagline: 'PARA TI',
    description: 'Un rincón tranquilo para descansar y disfrutar de tu propio ritmo.',
    bed: 'Cama sencilla (referencial)',
    bath: 'Baño privado con ducha (referencial)',
    photos: ['photo-1611892440504-42a792e24d32', 'photo-1631049307264-da0ec9d70304', 'photo-1595526114035-0d45ed16cfbf'],
  },
  Doble: {
    tagline: 'PARA COMPARTIR',
    description: 'Comodidad y calidez para una escapada en buena compañía.',
    bed: 'Cama doble (referencial)',
    bath: 'Baño privado con ducha (referencial)',
    photos: ['photo-1616594039964-ae9021a400a0', 'photo-1611892440504-42a792e24d32', 'photo-1618221195710-dd6b41faaea6'],
  },
  Familiar: {
    tagline: 'PARA DISFRUTAR JUNTOS',
    description: 'Más espacio para reunirse y crear recuerdos durante el viaje.',
    bed: 'Configuración familiar de cama doble y camas sencillas (referencial)',
    bath: 'Baño privado con ducha (referencial)',
    photos: ['photo-1590490360182-c33d57733427', 'photo-1566665797739-1674de7a421a', 'photo-1611892440504-42a792e24d32'],
  },
  Suite: {
    tagline: 'PARA CONSENTIRTE',
    description: 'Un ambiente especial para regalarte una estadía diferente.',
    bed: 'Cama queen (referencial)',
    bath: 'Baño privado con ducha (referencial)',
    photos: ['photo-1618221195710-dd6b41faaea6', 'photo-1611892440504-42a792e24d32', 'photo-1616594039964-ae9021a400a0'],
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const badge = (status) => `<span class="status-pill status-${statusClass[status] || ''}">${escapeHtml(status)}</span>`;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function setView(view) {
  document.querySelectorAll('.view-section').forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  if (view === 'dashboard') loadDashboard();
  if (view === 'reservations') loadReservations();
  if (view === 'rooms') loadRooms();
}

async function showApp() {
  $('#landing-screen').hidden = true;
  $('#login-screen').hidden = true;
  $('#app-screen').hidden = false;
  const session = await api('/api/session');
  $('#sender-email').textContent = session.senderEmail || 'Configura SMTP_USER en .env';
  $('#mail-warning').hidden = session.emailConfigured;
  updateEmailStatus(session.emailConfigured);
  $('#today-label').textContent = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());
  await Promise.all([loadRooms(), loadPlans()]);
  setView('dashboard');
}

function updateEmailStatus(configured) {
  const status = $('.email-status');
  status.classList.toggle('is-configured', configured);
  $('#email-status-label').textContent = configured ? 'SMTP configurado' : 'Correo sin configurar';
}

async function loadRooms() {
  rooms = await api('/api/rooms');
  renderRooms();
  populateRoomOptions();
}

async function loadPlans() {
  plans = await api('/api/meal-plans');
  const select = $('#reservation-form [name="meal_plan_id"]');
  select.innerHTML = plans.map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)} · ${currency.format(plan.price_per_person_night)} por persona/noche</option>`).join('');
}

function populateRoomOptions() {
  const select = $('#reservation-form [name="room_id"]');
  const availableRooms = rooms.filter((room) =>
    !['Mantenimiento', 'Ocupada'].includes(room.manual_status || room.status));
  select.innerHTML = availableRooms.length
    ? availableRooms.map((room) => `<option value="${room.id}">#${escapeHtml(room.number)} · ${escapeHtml(room.type)} · ${currency.format(room.price_per_night)}/noche · ${room.capacity} persona(s)</option>`).join('')
    : '<option value="">No hay habitaciones habilitadas</option>';
}

async function loadDashboard() {
  const [data, allReservations] = await Promise.all([api('/api/dashboard'), api('/api/reservations')]);
  const roomCount = Object.fromEntries(data.roomCounts.map((item) => [item.status, item.count]));
  const reservationCount = Object.fromEntries(data.reservationCounts.map((item) => [item.status, item.count]));
  const cards = [
    ['Habitaciones', rooms.length, `${roomCount.Disponible || 0} disponibles`, '▦'],
    ['Reservas activas', (reservationCount.Pendiente || 0) + (reservationCount.Confirmada || 0), `${reservationCount.Pendiente || 0} pendientes de confirmar`, '▤'],
    ['Huéspedes hoy', data.arrivals, 'Llegadas confirmadas para hoy', '♙'],
    ['En mantenimiento', roomCount.Mantenimiento || 0, 'Habitaciones no habilitadas', '⚒'],
  ];
  $('#dashboard-cards').innerHTML = cards.map(([title, value, caption, icon]) => `
    <article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon}</span></div>
    <strong class="stat-value">${value}</strong><span class="stat-caption">${caption}</span></article>
  `).join('');
  $('#recent-reservations').innerHTML = renderReservationTable(allReservations.slice(0, 5), true);
}

async function loadReservations() {
  reservations = await api('/api/reservations');
  renderReservations();
}

function renderReservationTable(items, compact = false) {
  if (!items.length) return '<div class="empty-state">Todavía no hay reservas registradas.</div>';
  return `<div class="table-wrap"><table><thead><tr>
    <th>Reserva</th><th>Huésped</th><th>Habitación</th><th>Estadía</th><th>Total</th><th>Estado</th>${compact ? '' : '<th>Acciones</th>'}
  </tr></thead><tbody>${items.map((reservation) => `<tr>
    <td><strong>#${reservation.id}</strong><div class="cell-subtle">${new Date(`${reservation.booked_at.replace(' ', 'T')}Z`).toLocaleDateString('es-CO')}</div></td>
    <td><div class="guest-cell"><strong>${escapeHtml(reservation.first_name)} ${escapeHtml(reservation.last_name)}</strong><span>${escapeHtml(reservation.document)}</span><span>${escapeHtml(reservation.email)}</span></div></td>
    <td><strong>#${escapeHtml(reservation.room_number)}</strong><div class="cell-subtle">${escapeHtml(reservation.room_type)} · ${escapeHtml(reservation.meal_plan)}</div></td>
    <td>${escapeHtml(reservation.check_in)}<div class="cell-subtle">hasta ${escapeHtml(reservation.check_out)} · ${reservation.people} persona(s)</div></td>
    <td><strong>${currency.format(reservation.total)}</strong></td><td>${badge(reservation.status)}</td>
    ${compact ? '' : `<td>${reservation.status === 'Pendiente' ? `<div class="row-actions"><button class="action-button action-primary" data-reservation-action="Confirmada" data-id="${reservation.id}">Confirmar</button><button class="action-button" data-reservation-action="Cancelada" data-id="${reservation.id}">Cancelar</button></div>` : reservation.status === 'Confirmada' ? `<button class="action-button action-primary" data-reservation-action="Finalizada" data-id="${reservation.id}">Finalizar estadía</button>` : ['Cancelada', 'Finalizada'].includes(reservation.status) ? `<button class="action-button action-danger" data-reservation-delete="${reservation.id}">Eliminar</button>` : '<span class="cell-subtle">—</span>'}</td>`}
  </tr>`).join('')}</tbody></table></div>`;
}

function renderReservations() {
  const query = $('#reservation-search').value.trim().toLowerCase();
  const filter = $('#reservation-filter').value;
  const filtered = reservations.filter((reservation) => {
    const text = `${reservation.id} ${reservation.first_name} ${reservation.last_name} ${reservation.document} ${reservation.room_number}`.toLowerCase();
    return (!query || text.includes(query)) && (!filter || reservation.status === filter);
  });
  $('#reservations-table').innerHTML = renderReservationTable(filtered);
}

function renderRooms() {
  $('#room-cards').innerHTML = rooms.length ? rooms.map((room) => `
    <article class="room-card">
      <div class="room-card-top"><div><h2 class="room-number">Habitación ${escapeHtml(room.number)}</h2><p class="room-type">${escapeHtml(room.type)}</p></div>${badge(room.status)}</div>
      <div class="room-details"><span>Capacidad <strong>${room.capacity} personas</strong></span><strong class="room-price">${currency.format(room.price_per_night)}<span class="cell-subtle"> / noche</span></strong></div>
      <label class="sr-only" for="room-status-${room.id}">Estado de habitación ${escapeHtml(room.number)}</label>
      <label class="sr-only" for="room-status-${room.id}">Bloqueo manual de habitación ${escapeHtml(room.number)}</label>
      <select id="room-status-${room.id}" class="room-status-select" data-room-status="${room.id}">
        <option value="Disponible" ${(room.manual_status || room.status) === 'Disponible' ? 'selected' : ''}>Sin bloqueo manual</option>
        <option value="Ocupada" ${(room.manual_status || room.status) === 'Ocupada' ? 'selected' : ''}>Ocupada manualmente</option>
        <option value="Mantenimiento" ${(room.manual_status || room.status) === 'Mantenimiento' ? 'selected' : ''}>Mantenimiento</option>
      </select>
      <p class="room-status-note">Reservas y ocupación se actualizan automáticamente según las fechas.</p>
    </article>
  `).join('') : '<div class="empty-state">No hay habitaciones registradas.</div>';
}

function calculatePreview() {
  const form = $('#reservation-form');
  const room = rooms.find((item) => item.id === Number(form.elements.room_id.value));
  const plan = plans.find((item) => item.id === Number(form.elements.meal_plan_id.value));
  const start = form.elements.check_in.value;
  const end = form.elements.check_out.value;
  const people = Number(form.elements.people.value);
  if (!room || !plan || !start || !end || end <= start || !people) {
    $('#reservation-total').textContent = 'Selecciona fechas válidas, habitación y personas para calcular el total.';
    return;
  }
  const nights = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  const total = nights * (room.price_per_night + plan.price_per_person_night * people);
  $('#reservation-total').innerHTML = `${nights} noche(s) · Habitación ${currency.format(room.price_per_night)}/noche + alimentación ${currency.format(plan.price_per_person_night)} por persona/noche<br><strong>Total estimado: ${currency.format(total)}</strong>`;
}

function openReservationDialog() {
  const form = $('#reservation-form');
  form.reset();
  const today = dateInputValue(new Date());
  form.elements.check_in.min = today;
  form.elements.check_out.min = today;
  form.elements.check_in.value = today;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDay = dateInputValue(nextDate);
  form.elements.check_out.value = nextDay;
  $('#reservation-error').textContent = '';
  populateRoomOptions();
  calculatePreview();
  $('#reservation-dialog').showModal();
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initializeBookingDates() {
  const arrival = new Date();
  arrival.setDate(arrival.getDate() + 1);
  const departure = new Date(arrival);
  departure.setDate(departure.getDate() + 1);
  const arrivalField = $('#arrival-date');
  const departureField = $('#departure-date');
  arrivalField.min = dateInputValue(new Date());
  arrivalField.value = dateInputValue(arrival);
  departureField.min = dateInputValue(departure);
  departureField.value = dateInputValue(departure);
}

function renderPublicRooms() {
  let visibleTypes = 0;
  for (const type of Object.keys(publicRoomTypes)) {
    const availableRooms = publicAvailability.rooms.filter((room) => room.type === type);
    const card = $(`[data-room-type="${type}"]`).closest('.room-type-card');
    card.hidden = availableRooms.length === 0;
    if (availableRooms.length) visibleTypes += 1;
    const label = availableRooms.length
      ? `${availableRooms.length} disponible(s) para las fechas · desde ${currency.format(Math.min(...availableRooms.map((room) => room.price_per_night)))}/noche`
      : 'Sin disponibilidad para las fechas elegidas';
    const availability = $(`[data-room-type-availability="${type}"]`);
    availability.textContent = label;
    availability.classList.toggle('is-unavailable', availableRooms.length === 0);
  }
  const emptyMessage = $('#room-types-empty');
  emptyMessage.textContent = visibleTypes
    ? ''
    : `No encontramos habitaciones disponibles para ${publicDates.people} huésped(es) en las fechas seleccionadas. Prueba con otras fechas o con menos huéspedes.`;
  emptyMessage.hidden = visibleTypes > 0;
}

function openRoomDetails(type) {
  const details = publicRoomTypes[type];
  if (!details) return;
  const availableRooms = publicAvailability.rooms.filter((room) => room.type === type);
  const images = details.photos.map((photo) =>
    `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=82`,
  );
  const roomOptions = availableRooms.map((room) =>
    `<option value="${room.id}">Habitación ${escapeHtml(room.number)} · ${currency.format(room.price_per_night)} por noche · hasta ${room.capacity} huésped(es)</option>`,
  ).join('');

  $('#room-details-content').innerHTML = `
    <header class="room-details-header">
      <div><p class="eyebrow">HABITACIÓN ${escapeHtml(type.toUpperCase())}</p><h2 id="room-details-title">${escapeHtml(type)}</h2></div>
      <button class="icon-button" type="button" data-close="room-details-dialog" aria-label="Cerrar">×</button>
    </header>
    <div class="room-gallery">
      <img class="room-gallery-main" src="${images[0]}" alt="Imagen referencial de habitación ${escapeHtml(type)}" fetchpriority="high">
      <img src="${images[1]}" alt="Detalle referencial de habitación ${escapeHtml(type)}" loading="lazy">
      <img src="${images[2]}" alt="Vista referencial adicional de habitación ${escapeHtml(type)}" loading="lazy">
    </div>
    <div class="room-details-body">
      <p class="room-details-description">${escapeHtml(details.description)}</p>
      <ul class="room-feature-list">
        <li><span>DESCANSO</span>${escapeHtml(details.bed)}</li>
        <li><span>BAÑO</span>${escapeHtml(details.bath)}</li>
        <li><span>CAPACIDAD</span>${availableRooms.length
    ? `Hasta ${availableRooms.reduce((max, room) => Math.max(max, room.capacity), 0)} huésped(es), según habitación.`
    : 'Consulta la capacidad disponible al cambiar las fechas o el número de huéspedes.'}</li>
      </ul>
      <p class="room-reference-note">Las fotografías y características de cama y baño son referenciales. Confirma los detalles con el hotel antes de completar la reserva.</p>
      ${availableRooms.length ? `
        <label class="room-choice-label" for="room-detail-choice">Habitación disponible para ${escapeHtml(publicDates.check_in)} al ${escapeHtml(publicDates.check_out)}</label>
        <select id="room-detail-choice" class="room-choice">${roomOptions}</select>
        <div class="room-detail-actions"><span id="room-detail-price" class="room-detail-price"></span><button class="button button-primary" type="button" data-public-book="${availableRooms[0].id}">Continuar con esta habitación <span>→</span></button></div>
      ` : `
        <p class="room-unavailable-message">No hay habitaciones de esta categoría disponibles para las fechas y el número de huéspedes seleccionados.</p>
        <a class="room-change-dates" href="#reservar" data-close="room-details-dialog">Cambiar fechas de búsqueda</a>
      `}
    </div>`;
  $('#room-details-dialog').showModal();
  if (availableRooms.length) updateRoomDetailsSelection(availableRooms[0].id);
}

function updateRoomDetailsSelection(roomId) {
  const room = publicAvailability.rooms.find((item) => item.id === Number(roomId));
  const button = $('[data-public-book]', $('#room-details-content'));
  if (!room || !button) return;
  button.dataset.publicBook = String(room.id);
  $('#room-detail-price').textContent = `${currency.format(room.price_per_night)} / noche`;
}

async function searchAvailability(event) {
  if (event) event.preventDefault();
  const checkIn = $('#arrival-date').value;
  const checkOut = $('#departure-date').value;
  const people = Number($('#guest-count').value);
  $('#availability-error').textContent = '';
  if (!checkIn || !checkOut || checkOut <= checkIn) {
    $('#availability-error').textContent = 'La salida debe ser posterior a la fecha de entrada.';
    return;
  }

  const searchButton = $('#availability-form button[type="submit"]');
  searchButton.disabled = true;
  searchButton.textContent = 'Buscando…';
  try {
    publicDates = { check_in: checkIn, check_out: checkOut, people };
    const query = new URLSearchParams({ check_in: checkIn, check_out: checkOut, people: String(people) });
    publicAvailability = await api(`/api/public/availability?${query}`);
    renderPublicRooms();
  } catch (error) {
    $('#availability-error').textContent = error.message;
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = 'Buscar habitación <span>→</span>';
  }
}

function calculatePublicTotal() {
  if (!selectedPublicRoom) return;
  const planId = Number($('#public-reservation-form').elements.meal_plan_id.value);
  const mealPlan = publicAvailability.mealPlans.find((plan) => plan.id === planId);
  if (!mealPlan) return;
  const nights = (Date.parse(`${publicDates.check_out}T00:00:00Z`) - Date.parse(`${publicDates.check_in}T00:00:00Z`)) / 86400000;
  const total = nights * (selectedPublicRoom.price_per_night + mealPlan.price_per_person_night * publicDates.people);
  $('#public-reservation-total').innerHTML = `${nights} noche(s) · ${publicDates.people} huésped(es) · ${escapeHtml(mealPlan.name)}<br><strong>Total estimado: ${currency.format(total)}</strong>`;
}

function openPublicReservation(roomId) {
  selectedPublicRoom = publicAvailability.rooms.find((room) => room.id === roomId);
  if (!selectedPublicRoom) {
    showToast('Actualiza la búsqueda para consultar disponibilidad.', true);
    return;
  }
  const form = $('#public-reservation-form');
  form.reset();
  form.elements.meal_plan_id.innerHTML = publicAvailability.mealPlans.map((plan) =>
    `<option value="${plan.id}">${escapeHtml(plan.name)} · ${currency.format(plan.price_per_person_night)} por huésped/noche</option>`,
  ).join('');
  $('#public-room-summary').textContent =
    `Habitación ${selectedPublicRoom.type} · ${publicDates.check_in} al ${publicDates.check_out} · ${publicDates.people} huésped(es)`;
  $('#public-reservation-error').textContent = '';
  calculatePublicTotal();
  $('#public-reservation-dialog').showModal();
}

function showLogin() {
  $('#landing-screen').hidden = true;
  $('#login-screen').hidden = false;
  $('#app-screen').hidden = true;
  $('#login-error').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showHome() {
  $('#login-screen').hidden = true;
  $('#app-screen').hidden = true;
  $('#landing-screen').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#login-error').textContent = '';
  const form = new FormData(event.currentTarget);
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
    await showApp();
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
});

$('#logout-button').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  $('#app-screen').hidden = true;
  $('#landing-screen').hidden = false;
  $('#login-screen').hidden = true;
  $('#login-form').reset();
});

$('#availability-form').addEventListener('submit', searchAvailability);
$('#arrival-date').addEventListener('change', () => {
  const arrival = $('#arrival-date').value;
  if (arrival) {
    const minimumDeparture = new Date(`${arrival}T00:00:00`);
    minimumDeparture.setDate(minimumDeparture.getDate() + 1);
    const minimumValue = dateInputValue(minimumDeparture);
    $('#departure-date').min = minimumValue;
    if ($('#departure-date').value < minimumValue) $('#departure-date').value = minimumValue;
  }
});
$('#public-reservation-form').addEventListener('change', calculatePublicTotal);
$('#public-reservation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedPublicRoom) return;
  $('#public-reservation-error').textContent = '';
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  Object.assign(payload, publicDates, {
    room_id: selectedPublicRoom.id,
    people: publicDates.people,
    meal_plan_id: Number(payload.meal_plan_id),
  });
  try {
    await api('/api/public/reservations', { method: 'POST', body: JSON.stringify(payload) });
    $('#public-reservation-dialog').close();
    showToast('Solicitud recibida. El hotel confirmará la reserva y te enviará un correo.');
    await searchAvailability();
  } catch (error) {
    $('#public-reservation-error').textContent = error.message;
  }
});

document.querySelectorAll('[data-action="show-login"]').forEach((button) => {
  button.addEventListener('click', showLogin);
});
document.querySelectorAll('[data-action="show-home"]').forEach((button) => {
  button.addEventListener('click', showHome);
});
document.querySelectorAll('a[href="#reservar"]').forEach((link) => {
  link.addEventListener('click', () => {
    if (!$('#landing-screen').hidden) setTimeout(() => $('#arrival-date').focus({ preventScroll: true }), 0);
  });
});
document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});
document.querySelectorAll('[data-action="new-reservation"]').forEach((button) => {
  button.addEventListener('click', openReservationDialog);
});
document.querySelectorAll('[data-action="new-room"]').forEach((button) => {
  button.addEventListener('click', () => {
    $('#room-form').reset();
    $('#room-error').textContent = '';
    $('#room-dialog').showModal();
  });
});
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(button.dataset.close).close());
});
$('#reservation-search').addEventListener('input', renderReservations);
$('#reservation-filter').addEventListener('change', renderReservations);
$('#room-details-content').addEventListener('change', (event) => {
  if (event.target.matches('#room-detail-choice')) updateRoomDetailsSelection(event.target.value);
});
$('#reservation-form').addEventListener('input', calculatePreview);
$('#reservation-form').addEventListener('change', calculatePreview);
$('#reservation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#reservation-error').textContent = '';
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  payload.people = Number(payload.people);
  payload.room_id = Number(payload.room_id);
  payload.meal_plan_id = Number(payload.meal_plan_id);
  try {
    await api('/api/reservations', { method: 'POST', body: JSON.stringify(payload) });
    $('#reservation-dialog').close();
    showToast('Reserva registrada. Confírmala para enviar el correo al huésped.');
    await Promise.all([loadRooms(), loadReservations(), loadDashboard()]);
  } catch (error) {
    $('#reservation-error').textContent = error.message;
  }
});

$('#room-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('#room-error').textContent = '';
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  payload.capacity = Number(payload.capacity);
  payload.price_per_night = Number(payload.price_per_night);
  try {
    await api('/api/rooms', { method: 'POST', body: JSON.stringify(payload) });
    $('#room-dialog').close();
    showToast('Habitación agregada correctamente.');
    await loadRooms();
    await loadDashboard();
  } catch (error) {
    $('#room-error').textContent = error.message;
  }
});

document.addEventListener('click', async (event) => {
  const closeButton = event.target.closest('[data-close]');
  if (closeButton) {
    document.getElementById(closeButton.dataset.close)?.close();
    return;
  }
  const roomTypeButton = event.target.closest('[data-room-type]');
  if (roomTypeButton) {
    openRoomDetails(roomTypeButton.dataset.roomType);
    return;
  }
  const publicBookButton = event.target.closest('[data-public-book]');
  if (publicBookButton) {
    if ($('#room-details-dialog').open) $('#room-details-dialog').close();
    openPublicReservation(Number(publicBookButton.dataset.publicBook));
    return;
  }
  const deleteButton = event.target.closest('[data-reservation-delete]');
  if (deleteButton) {
    const id = Number(deleteButton.dataset.reservationDelete);
    if (!window.confirm(`¿Eliminar permanentemente la reserva #${id}? Esta acción no se puede deshacer.`)) return;
    deleteButton.disabled = true;
    try {
      await api(`/api/reservations/${id}`, { method: 'DELETE' });
      showToast(`Reserva #${id} eliminada.`);
      await Promise.all([loadRooms(), loadReservations(), loadDashboard()]);
    } catch (error) {
      showToast(error.message, true);
      deleteButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest('[data-reservation-action]');
  if (!button) return;
  const id = Number(button.dataset.id);
  const status = button.dataset.reservationAction;
  if (status === 'Cancelada' && !window.confirm('¿Cancelar esta reserva?')) return;
  button.disabled = true;
  try {
    await api(`/api/reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    const message = {
      Confirmada: 'Reserva confirmada y correo enviado al huésped.',
      Cancelada: 'Reserva cancelada.',
      Finalizada: 'Estadía finalizada correctamente.',
    }[status];
    showToast(message);
    await Promise.all([loadRooms(), loadReservations(), loadDashboard()]);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
});

document.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-room-status]');
  if (!select) return;
  try {
    await api(`/api/rooms/${select.dataset.roomStatus}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: select.value }),
    });
    showToast('Estado de habitación actualizado.');
    await Promise.all([loadRooms(), loadDashboard()]);
  } catch (error) {
    showToast(error.message, true);
    await loadRooms();
  }
});

(async function initialize() {
  initializeBookingDates();
  try {
    const session = await api('/api/session');
    updateEmailStatus(session.emailConfigured);
    if (session.user) await showApp();
    else await searchAvailability();
  } catch (error) {
    showToast(error.message, true);
  }
})();
