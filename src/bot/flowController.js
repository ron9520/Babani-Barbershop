const { STATE, getSession, setSession, clearSession, updateSession } = require('./sessionManager');
const responses = require('./responses');
const calendarService = require('../services/calendarService');
const firebaseService = require('../services/firebaseService');
const twilioService = require('../services/twilioService');
const { getAvailableDates, generateSlots, parseDateInput, fromISO, formatDate, formatTime, TZ } = require('../utils/timeUtils');
const logger = require('../utils/logger');
const config = require('../../config/config.json');
const { DateTime } = require('luxon');

/**
 * Main flow controller. Receives a WhatsApp message and returns a reply string.
 * @param {string} phone  - "whatsapp:+972..."
 * @param {string} body   - incoming message text
 * @returns {string}      - reply text
 */
async function handleMessage(phone, body) {
  const input = body.trim();
  const lower = input.toLowerCase();

  // Global commands
  if (['היי', 'הי', 'שלום', 'hi', 'hello', 'התחל', 'start', 'menu'].includes(lower)) {
    await clearSession(phone);
    return responses.welcome();
  }

  if (['ביטול', 'cancel', 'בטל'].includes(lower)) {
    return await handleCancelRequest(phone);
  }

  const session = await getSession(phone);

  // No session → start fresh
  if (!session || session.state === STATE.IDLE) {
    await setSession(phone, { state: STATE.CHOOSE_ACTION });
    return responses.welcome();
  }

  switch (session.state) {
    case STATE.CHOOSE_ACTION:
      return await handleChooseAction(phone, input);

    case STATE.CHOOSE_SERVICE:
      return await handleChooseService(phone, input);

    case STATE.CHOOSE_DATE:
      return await handleChooseDate(phone, input, session);

    case STATE.CHOOSE_TIME:
      return await handleChooseTime(phone, input, session);

    case STATE.ENTER_NAME:
      return await handleEnterName(phone, input, session);

    case STATE.CONFIRM:
      return await handleConfirm(phone, input, session);

    case STATE.CANCEL_CONFIRM:
      return await handleCancelConfirm(phone, input, session);

    default:
      await clearSession(phone);
      return responses.welcome();
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleChooseAction(phone, input) {
  if (input === '1') {
    await updateSession(phone, { state: STATE.CHOOSE_SERVICE });
    return responses.chooseService();
  }
  if (input === '2') {
    return await handleCancelRequest(phone);
  }
  return responses.invalidInput();
}

async function handleChooseService(phone, input) {
  const idx = parseInt(input) - 1;
  const service = config.services[idx];
  if (!service) return responses.invalidInput();

  const dates = getAvailableDates();
  await updateSession(phone, {
    state: STATE.CHOOSE_DATE,
    serviceId: service.id,
    serviceName: service.name,
    servicePrice: service.price,
    serviceDuration: service.durationMinutes,
    availableDates: dates.map(d => d.toISO())
  });

  return responses.chooseDate(dates);
}

async function handleChooseDate(phone, input, session) {
  const dates = session.availableDates.map(d => fromISO(d));

  let chosen;
  // Try numeric selection
  const idx = parseInt(input) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < dates.length) {
    chosen = dates[idx];
  } else {
    // Try DD/MM format
    chosen = parseDateInput(input);
    if (!chosen || !dates.some(d => d.toFormat('dd/MM') === chosen.toFormat('dd/MM'))) {
      return responses.invalidInput();
    }
  }

  const slots = generateSlots(chosen);
  const busyTimes = await calendarService.getBusySlotsForDate(chosen);
  const availableSlots = slots.filter(s => !busyTimes.includes(s.toFormat('HH:mm')));

  if (availableSlots.length === 0) {
    return `😔 אין שעות פנויות ב-${chosen.toFormat('dd/MM')}. אנא בחר תאריך אחר.\n\n` + responses.chooseDate(dates);
  }

  await updateSession(phone, {
    state: STATE.CHOOSE_TIME,
    selectedDate: chosen.toISO(),
    availableSlots: availableSlots.map(s => s.toISO()),
    busyTimes
  });

  return responses.chooseTime(slots, busyTimes);
}

async function handleChooseTime(phone, input, session) {
  const slots = session.availableSlots.map(s => fromISO(s));
  const idx = parseInt(input) - 1;
  if (isNaN(idx) || idx < 0 || idx >= slots.length) return responses.invalidInput();

  const chosen = slots[idx];
  await updateSession(phone, {
    state: STATE.ENTER_NAME,
    selectedTime: chosen.toISO()
  });

  return responses.enterName();
}

async function handleEnterName(phone, input, session) {
  const name = input.trim();
  if (name.length < 2 || name.length > 50) {
    return `❓ אנא הזן שם תקין (לפחות 2 תווים).`;
  }

  const start = fromISO(session.selectedTime);
  const end = start.plus({ minutes: session.serviceDuration });

  await updateSession(phone, {
    state: STATE.CONFIRM,
    customerName: name,
    dateDisplay: formatDate(start),
    timeDisplay: formatTime(start),
    startISO: start.toISO(),
    endISO: end.toISO()
  });

  return responses.confirmAppointment({
    serviceName: session.serviceName,
    servicePrice: session.servicePrice,
    dateDisplay: formatDate(start),
    timeDisplay: formatTime(start),
    customerName: name
  });
}

async function handleConfirm(phone, input, session) {
  if (['לא', 'no', 'n'].includes(input.toLowerCase())) {
    await clearSession(phone);
    return responses.cancelled();
  }

  if (!['כן', 'yes', 'y', 'אישור'].includes(input.toLowerCase())) {
    return `❓ שלח *כן* לאישור או *לא* לביטול.`;
  }

  // Double-check slot availability
  const available = await calendarService.isSlotAvailable(session.startISO, session.endISO);
  if (!available) {
    await clearSession(phone);
    return responses.slotTaken() + '\n\nשלח *היי* להתחלה מחדש.';
  }

  // Create calendar event
  const eventId = await calendarService.createAppointment({
    startISO: session.startISO,
    endISO: session.endISO,
    customerName: session.customerName,
    serviceName: session.serviceName,
    phone
  });

  if (!eventId) {
    // Race condition — slot was grabbed between our check and insert
    await clearSession(phone);
    return responses.slotTaken() + '\n\nשלח *היי* להתחלה מחדש.';
  }

  // Save to Firestore
  await firebaseService.saveAppointment({
    phone,
    customerName: session.customerName,
    serviceId: session.serviceId,
    serviceName: session.serviceName,
    servicePrice: session.servicePrice,
    startISO: session.startISO,
    endISO: session.endISO,
    dateDisplay: session.dateDisplay,
    timeDisplay: session.timeDisplay,
    calendarEventId: eventId,
    status: 'confirmed'
  });

  // Notify barber
  try {
    await twilioService.notifyBarber({
      customerName: session.customerName,
      serviceName: session.serviceName,
      servicePrice: session.servicePrice,
      dateDisplay: session.dateDisplay,
      timeDisplay: session.timeDisplay,
      phone
    });
  } catch (err) {
    logger.error('Failed to notify barber', { error: err.message });
  }

  await clearSession(phone);
  return responses.appointmentBooked({
    serviceName: session.serviceName,
    dateDisplay: session.dateDisplay,
    timeDisplay: session.timeDisplay
  });
}

async function handleCancelRequest(phone) {
  const appointment = await firebaseService.getAppointmentByPhone(phone);
  if (!appointment) {
    return responses.noAppointmentFound();
  }

  await updateSession(phone, {
    state: STATE.CANCEL_CONFIRM,
    appointmentId: appointment.id,
    calendarEventId: appointment.calendarEventId,
    appointmentDisplay: `${appointment.serviceName} ב-${appointment.dateDisplay} בשעה ${appointment.timeDisplay}`
  });

  return (
    `🗑️ *ביטול תור*\n\n` +
    `התור שלך: ${appointment.serviceName}\n` +
    `📅 ${appointment.dateDisplay} | 🕐 ${appointment.timeDisplay}\n\n` +
    `לאישור הביטול שלח *כן*, לחזרה שלח *לא*`
  );
}

async function handleCancelConfirm(phone, input, session) {
  if (['לא', 'no', 'n'].includes(input.toLowerCase())) {
    await clearSession(phone);
    return responses.cancelled();
  }

  if (!['כן', 'yes', 'y', 'אישור'].includes(input.toLowerCase())) {
    return `❓ שלח *כן* לאישור הביטול או *לא* לחזרה.`;
  }

  // Cancel in calendar
  try {
    await calendarService.deleteAppointment(session.calendarEventId);
  } catch (err) {
    logger.error('Failed to delete calendar event', { eventId: session.calendarEventId, error: err.message });
  }

  // Cancel in Firestore
  await firebaseService.cancelAppointment(session.appointmentId);

  // Notify barber about cancellation
  try {
    const appointment = await firebaseService.getAppointmentById(session.appointmentId);
    if (appointment) {
      await twilioService.notifyBarberCancellation({
        customerName: appointment.customerName,
        serviceName: appointment.serviceName,
        dateDisplay: appointment.dateDisplay,
        timeDisplay: appointment.timeDisplay,
        phone
      });
    }
  } catch (err) {
    logger.error('Failed to notify barber about cancellation', { error: err.message });
  }

  await clearSession(phone);
  return responses.appointmentCancelled();
}

module.exports = { handleMessage };
