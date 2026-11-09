const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');

const outputDirectory = path.join(__dirname, '..', 'entregables');
const outputPath = path.join(outputDirectory, 'Informe_Hotel_Paraiso_Real.pdf');
const colors = {
  navy: '#102A43',
  navyLight: '#193B56',
  gold: '#C89B5C',
  ink: '#263D4D',
  muted: '#71818D',
  line: '#E4E9EC',
  paper: '#F7F8F8',
  white: '#FFFFFF',
  green: '#3D8A6D',
};
const pageWidth = 595.28;
const pageHeight = 841.89;
const left = 54;
const contentWidth = pageWidth - left * 2;

function footer(doc, pageNumber) {
  doc.strokeColor(colors.line).lineWidth(0.7).moveTo(left, 795).lineTo(pageWidth - left, 795).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(colors.muted)
    .text('Hotel Paraíso Real | Aplicación con interfaces gráficas', left, 805, { width: 370 });
  doc.text(String(pageNumber), pageWidth - left - 20, 805, { width: 20, align: 'right' });
}

function pageHeading(doc, eyebrow, title, subtitle) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.gold).text(eyebrow.toUpperCase(), left, 54, {
    characterSpacing: 1.5,
  });
  doc.font('Helvetica-Bold').fontSize(23).fillColor(colors.navy).text(title, left, 73);
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text(subtitle, left, 105, {
    width: contentWidth,
    lineGap: 2,
  });
}

function paragraph(doc, text, x, y, width = contentWidth, options = {}) {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 10)
    .fillColor(options.color || colors.ink)
    .text(text, x, y, { width, lineGap: options.lineGap ?? 3, align: options.align || 'left' });
}

function section(doc, title, text, y) {
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.navy).text(title, left, y);
  paragraph(doc, text, left, y + 20);
}

function drawFigureLanding(doc, x, y, width, height) {
  doc.roundedRect(x, y, width, height, 7).fillAndStroke(colors.white, colors.line);
  doc.rect(x, y, width, 28).fill(colors.white);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.navy).text('PR  PARAÍSO REAL', x + 12, y + 10);
  doc.font('Helvetica').fontSize(6).fillColor(colors.ink).text('Habitaciones     Experiencias     El hotel', x + width * .39, y + 11);
  doc.roundedRect(x + width - 104, y + 6, 90, 16, 3).fill(colors.navy);
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(colors.white).text('ÁREA ADMINISTRATIVA', x + width - 98, y + 11);

  const heroY = y + 28;
  doc.rect(x, heroY, width, 104).fill(colors.navyLight);
  doc.rect(x + width * .55, heroY, width * .45, 104).fill('#3D5A5D');
  doc.circle(x + width * .79, heroY + 22, 38).fill('#58746D');
  doc.font('Helvetica-Bold').fontSize(6).fillColor('#E7C99D').text('UN LUGAR PARA VOLVER A TI', x + 22, heroY + 23);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(colors.white).text('El descanso que', x + 22, heroY + 38);
  doc.text('te mereces.', x + 22, heroY + 58);
  doc.font('Helvetica').fontSize(6).fillColor('#E3E9E9')
    .text('Calidez, descanso y momentos especiales.', x + 22, heroY + 82);

  const bookingY = heroY + 104;
  doc.rect(x, bookingY, width, 44).fill('#FAF9F6');
  const fields = ['Entrada  ·  Fecha', 'Salida  ·  Fecha', 'Huéspedes  ·  2'];
  const fieldWidth = (width - 100) / 3;
  fields.forEach((field, index) => {
    const fieldX = x + 12 + index * (fieldWidth + 5);
    doc.roundedRect(fieldX, bookingY + 9, fieldWidth, 26, 2).fillAndStroke(colors.white, colors.line);
    doc.font('Helvetica').fontSize(5.5).fillColor(colors.ink).text(field, fieldX + 7, bookingY + 19);
  });
  doc.roundedRect(x + width - 81, bookingY + 9, 69, 26, 2).fill(colors.gold);
  doc.font('Helvetica-Bold').fontSize(5.5).fillColor(colors.white).text('BUSCAR', x + width - 63, bookingY + 19);

  const cardsY = bookingY + 53;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.navy).text('Tu refugio ideal te espera', x + 12, cardsY);
  const cardGap = 9;
  const cardWidth = (width - 24 - cardGap * 2) / 3;
  ['Sencilla', 'Doble', 'Familiar'].forEach((label, index) => {
    const cardX = x + 12 + index * (cardWidth + cardGap);
    doc.roundedRect(cardX, cardsY + 14, cardWidth, 39, 3).fillAndStroke('#FFFFFF', colors.line);
    doc.rect(cardX, cardsY + 14, cardWidth, 19).fill(index === 0 ? '#D8D6CA' : index === 1 ? '#B9C8C0' : '#CEC5B3');
    doc.font('Helvetica-Bold').fontSize(6).fillColor(colors.navy).text(label, cardX + 6, cardsY + 38);
    doc.font('Helvetica').fontSize(5).fillColor(colors.muted).text('Desde COP · por noche', cardX + 6, cardsY + 47);
  });
}

function drawEntity(doc, x, y, width, title, lines) {
  const height = 25 + lines.length * 14;
  doc.roundedRect(x, y, width, height, 5).fillAndStroke(colors.white, colors.line);
  doc.roundedRect(x, y, width, 23, 5).fill(colors.navy);
  doc.rect(x, y + 18, width, 5).fill(colors.navy);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(colors.white).text(title, x + 8, y + 7);
  lines.forEach((line, index) => {
    doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(colors.ink)
      .text(line, x + 8, y + 31 + index * 14, { width: width - 16 });
  });
  return height;
}

function drawRelationship(doc, x1, y1, x2, y2, label) {
  doc.save().strokeColor(colors.gold).lineWidth(1.2).moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
  doc.font('Helvetica').fontSize(6).fillColor(colors.muted).text(label, (x1 + x2) / 2 - 18, (y1 + y2) / 2 - 8);
}

function addCover(doc) {
  doc.rect(0, 0, pageWidth, pageHeight).fill(colors.navy);
  doc.rect(0, 0, pageWidth, 14).fill(colors.gold);
  doc.circle(pageWidth / 2, 200, 39).lineWidth(1.5).strokeColor(colors.gold).stroke();
  doc.font('Helvetica-Bold').fontSize(17).fillColor(colors.gold).text('PR', pageWidth / 2 - 13, 190);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.white).text('HOTEL PARAÍSO REAL', 0, 251, {
    width: pageWidth,
    align: 'center',
    characterSpacing: 2,
  });
  doc.font('Helvetica-Bold').fontSize(27).fillColor(colors.white).text('Sistema de reservas', 0, 310, {
    width: pageWidth,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(15).fillColor('#D6E0E6').text('Aplicación con interfaces gráficas (GUI)', 0, 350, {
    width: pageWidth,
    align: 'center',
  });
  doc.moveTo(194, 395).lineTo(401, 395).lineWidth(1).strokeColor(colors.gold).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.white).text('Presentado por', 0, 435, {
    width: pageWidth,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(10).fillColor('#D6E0E6').text(
    '1. [Nombre del estudiante]   2. [Nombre del estudiante]   3. [Nombre del estudiante]',
    55, 457, { width: pageWidth - 110, align: 'center' },
  );
  doc.font('Helvetica').fontSize(9).fillColor('#D6E0E6').text(
    'Institución: [Nombre de la institución]\nMódulo: [Nombre del módulo]   |   Docente: [Nombre del docente]\n[Ciudad], 8 de noviembre de 2026',
    70, 650, { width: pageWidth - 140, align: 'center', lineGap: 7 },
  );
}

function addProblemPage(doc) {
  doc.addPage();
  pageHeading(doc, '01 · planteamiento', 'Problema y objetivo', 'Caso práctico: sistema de reservas de habitaciones del Hotel Paraíso Real.');
  section(doc, 'Identificación del problema',
    'El hotel registra actualmente sus reservas de forma manual. Esto puede duplicar información de huéspedes, dificultar la consulta de disponibilidad y generar errores en fechas, alimentación y cálculo de tarifas. Se necesita centralizar huéspedes, habitaciones, planes y reservas, y evitar que dos reservas activas ocupen la misma habitación en fechas coincidentes.',
    145);
  section(doc, 'Objetivo general',
    'Construir una aplicación con interfaz gráfica para administrar las reservas del hotel, conservar los datos en una base SQLite y facilitar el registro, consulta y confirmación de estadías.',
    245);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.navy).text('Objetivos específicos', left, 310);
  const objectives = [
    'Registrar huéspedes y asociarlos con una o varias reservas.',
    'Gestionar habitaciones, tipos, capacidad, tarifa y estado.',
    'Validar fechas, capacidad y disponibilidad antes de guardar una reserva.',
    'Calcular el total por noches, habitación, alimentación y número de personas.',
    'Enviar un correo al huésped cuando el administrador confirma la reserva.',
  ];
  objectives.forEach((item, index) => {
    doc.circle(left + 4, 338 + index * 25, 2).fill(colors.gold);
    paragraph(doc, item, left + 14, 333 + index * 25, contentWidth - 14, { size: 9 });
  });
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.navy).text('Roles de trabajo en equipo', left, 485);
  const roles = [
    ['Estudiante 1 · Análisis', 'Documentar el problema, requisitos, reglas de disponibilidad y modelo de datos.'],
    ['Estudiante 2 · Desarrollo', 'Construir la interfaz, las rutas del servidor y las operaciones con SQLite.'],
    ['Estudiante 3 · Pruebas y documentación', 'Probar los casos principales, configurar el correo y preparar el informe.'],
  ];
  roles.forEach(([title, detail], index) => {
    const y = 512 + index * 68;
    doc.roundedRect(left, y, contentWidth, 54, 5).fillAndStroke(colors.paper, colors.line);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy).text(title, left + 12, y + 9);
    paragraph(doc, detail, left + 12, y + 25, contentWidth - 24, { size: 8 });
  });
  footer(doc, 2);
}

function addInterfacePage(doc) {
  doc.addPage();
  pageHeading(doc, '02 · diseño de la interfaz', 'Esquema de la aplicación', 'La página pública presenta el hotel y permite consultar disponibilidad antes de solicitar una reserva.');
  drawFigureLanding(doc, left, 145, contentWidth, 260);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy).text('Figura 1. Esquema visual de la página de inicio pública.', left, 420);
  paragraph(doc,
    'La figura representa la página pública del Hotel Paraíso Real: navegación principal, imagen de bienvenida, formulario para consultar fechas y huéspedes y tarjetas de habitaciones disponibles. El visitante puede seleccionar una opción y enviar sus datos como solicitud pendiente; el personal del hotel la revisa y la confirma desde el panel administrativo. Es una representación del diseño implementado y no una captura fotográfica.',
    left, 438, contentWidth, { size: 9 },
  );

  const labels = [
    ['Página pública', 'Presentación del hotel, experiencias, navegación y habitaciones disponibles.'],
    ['Búsqueda', 'Consulta de habitaciones por fechas futuras y número de huéspedes.'],
    ['Solicitud', 'Datos del visitante, alimentación y total antes de enviar una reserva pendiente.'],
    ['Administración', 'Inicio de sesión y gestión, confirmación y seguimiento de reservas.'],
  ];
  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.navy).text('Descripción de las interfaces', left, 530);
  labels.forEach(([title, detail], index) => {
    const y = 555 + index * 45;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.ink).text(title, left, y);
    paragraph(doc, detail, left + 104, y, contentWidth - 104, { size: 8 });
  });
  footer(doc, 3);
}

function addDataPage(doc) {
  doc.addPage();
  pageHeading(doc, '03 · desarrollo', 'Datos y reglas del sistema', 'La base de datos se guarda localmente y conserva las relaciones necesarias para consultar el historial.');

  drawRelationship(doc, 325, 241, 360, 350, '1 a muchos');
  drawRelationship(doc, 465, 227, 433, 350, '1 a muchos');
  drawRelationship(doc, 216, 350, 300, 385, '1 a muchos');

  drawEntity(doc, 66, 160, 145, 'users', ['id · clave primaria', 'email · único', 'password_hash · scrypt']);
  drawEntity(doc, 245, 160, 155, 'rooms', ['id · clave primaria', 'number · único', 'type · capacity', 'price_per_night · status']);
  drawEntity(doc, 420, 160, 120, 'meal_plans', ['id · clave primaria', 'name · único', 'price/persona/noche']);
  drawEntity(doc, 66, 300, 150, 'guests', ['id · clave primaria', 'document · único', 'nombre · teléfono', 'correo electrónico']);
  drawEntity(doc, 300, 350, 205, 'reservations', ['id · clave primaria', 'guest_id · FK', 'room_id · FK', 'meal_plan_id · FK', 'fechas · personas · estado', 'total · precio congelado']);

  doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.navy).text('Figura 2. Esquema relacional de la base de datos.', left, 540);
  paragraph(doc,
    'Las claves foráneas conectan una reserva con un huésped, una habitación y un plan de alimentación. Un huésped puede tener varias reservas. El precio del plan utilizado se copia en la reserva para conservar el cálculo original aunque el catálogo cambie.',
    left, 558, contentWidth, { size: 9 },
  );

  doc.font('Helvetica-Bold').fontSize(11).fillColor(colors.navy).text('Reglas y cálculo del valor', left, 625);
  paragraph(doc,
    'Una habitación se reserva solo si su capacidad es suficiente, no está en mantenimiento u ocupada y no existe otra reserva pendiente o confirmada que se cruce con las fechas solicitadas. Las fechas deben formar una estadía de al menos una noche y hasta 365 noches. El flujo administrativo permite confirmar o cancelar una solicitud pendiente y finalizar una reserva confirmada.',
    left, 646, contentWidth, { size: 9 },
  );
  doc.roundedRect(left, 702, contentWidth, 45, 5).fillAndStroke('#F7F3EA', '#EBDDC4');
  paragraph(doc,
    'Total = (tarifa de habitación + tarifa de alimentación × personas) × noches. Ejemplo: habitación doble COP 180.000, desayuno COP 25.000 por persona y 2 huéspedes durante 2 noches = COP 920.000.',
    left + 12, 713, contentWidth - 24, { size: 8, bold: true, color: colors.navy },
  );
  footer(doc, 4);
}

function addTestsAndConclusionsPage(doc) {
  doc.addPage();
  pageHeading(doc, '04 · validación', 'Pruebas y conclusiones', 'Se verificaron los flujos principales de autenticación, disponibilidad, almacenamiento y operación de habitaciones.');
  const rows = [
    ['Acceso sin iniciar sesión', 'La API de habitaciones responde 401.', 'Correcto'],
    ['Contraseña incorrecta', 'El inicio de sesión responde 401.', 'Correcto'],
    ['Registro de reserva', 'Se crea una reserva pendiente y se persisten huésped y estadía.', 'Correcto'],
    ['Cruce de fechas', 'Una segunda reserva para la misma habitación y fechas responde 409.', 'Correcto'],
    ['Correo sin SMTP', 'La confirmación responde 503 y conserva el estado pendiente.', 'Correcto'],
    ['Habitación duplicada', 'La creación con número existente responde 409.', 'Correcto'],
    ['Finalizar estadía', 'Una reserva confirmada cambia a Finalizada.', 'Correcto'],
    ['Estado de habitación', 'Se calcula con las reservas y fechas; se libera al finalizar.', 'Correcto'],
  ];
  const colWidths = [142, 270, 75];
  const startY = 150;
  let rowY = startY;
  doc.rect(left, rowY, contentWidth, 28).fill(colors.navy);
  ['Prueba', 'Resultado esperado / observado', 'Estado'].forEach((label, index) => {
    const x = left + colWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(colors.white).text(label, x + 7, rowY + 10, { width: colWidths[index] - 12 });
  });
  rowY += 28;
  rows.forEach((row, rowIndex) => {
    const height = rowIndex === 2 ? 43 : 36;
    doc.rect(left, rowY, contentWidth, height).fillAndStroke(rowIndex % 2 ? colors.white : colors.paper, colors.line);
    row.forEach((cell, index) => {
      const x = left + colWidths.slice(0, index).reduce((sum, width) => sum + width, 0);
      paragraph(doc, cell, x + 7, rowY + 9, colWidths[index] - 13, { size: 7, bold: index === 2, color: index === 2 ? colors.green : colors.ink });
    });
    rowY += height;
  });

  doc.font('Helvetica-Bold').fontSize(12).fillColor(colors.navy).text('Conclusiones', left, rowY + 25);
  const conclusions = [
    'La interfaz reúne en un solo lugar las tareas esenciales para gestionar habitaciones, huéspedes y reservas, reduciendo la dependencia de registros manuales.',
    'SQLite ofrece almacenamiento persistente y relaciones claras; las validaciones de capacidad y fechas evitan inconsistencias comunes.',
    'La confirmación por correo depende de credenciales SMTP válidas. Si falla el envío, la reserva permanece pendiente para que el administrador corrija la configuración y reintente.',
  ];
  conclusions.forEach((text, index) => {
    doc.circle(left + 4, rowY + 54 + index * 53, 2).fill(colors.gold);
    paragraph(doc, text, left + 14, rowY + 48 + index * 53, contentWidth - 14, { size: 8 });
  });
  footer(doc, 5);
}

function addReferencesPage(doc) {
  doc.addPage();
  pageHeading(doc, '05 · fuentes consultadas', 'Referencias', 'Documentación oficial consultada para las tecnologías utilizadas (formato APA, 7.ª edición).');
  const references = [
    'Express. (s. f.). Express 5.x API reference. https://expressjs.com/en/5x/api.html',
    'Node.js. (s. f.). Node.js v24 documentation. https://nodejs.org/docs/latest-v24.x/api/',
    'Nodemailer. (s. f.). Nodemailer documentation. https://nodemailer.com/',
    'SQLite. (s. f.). SQLite documentation. https://www.sqlite.org/docs.html',
  ];
  references.forEach((reference, index) => {
    paragraph(doc, reference, left + 18, 160 + index * 63, contentWidth - 18, { size: 10 });
  });
  doc.roundedRect(left, 470, contentWidth, 100, 6).fillAndStroke(colors.paper, colors.line);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(colors.navy).text('Antes de entregar', left + 14, 486);
  paragraph(doc,
    'Completa los campos entre corchetes de la portada con los nombres de los tres integrantes, institución, módulo, docente y ciudad. Configura las credenciales SMTP locales para demostrar el envío de correo; no incluyas contraseñas en el informe ni en el código entregado.',
    left + 14, 508, contentWidth - 28, { size: 9 },
  );
  footer(doc, 6);
}

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: false, info: {
    Title: 'Sistema de reservas - Hotel Paraíso Real',
    Subject: 'Aplicación con interfaces gráficas de usuario',
    Author: 'Equipo de trabajo',
  } });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);
  addCover(doc);
  addProblemPage(doc);
  addInterfacePage(doc);
  addDataPage(doc);
  addTestsAndConclusionsPage(doc);
  addReferencesPage(doc);
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  console.log(`Informe generado: ${outputPath}`);
}

main().catch((error) => {
  console.error('No se pudo generar el informe:', error);
  process.exitCode = 1;
});
