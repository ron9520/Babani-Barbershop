const { DateTime, Interval } = require('luxon');
const config = require('../../config/config.json');

const TZ = config.shop.timezone; // Asia/Jerusalem

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nowInIsrael() {
  return DateTime.now().setZone(TZ);
}

function parseIsraelDate(ddmm, year) {
  const [day, month] = ddmm.split('/').map(Number);
  const y = year || nowInIsrael().year;
  return DateTime.fromObject({ year: y, month, day }, { zone: TZ });
}

function formatDate(dt) {
  return dt.toFormat('dd/MM');
}

function formatTime(dt) {
  return dt.toFormat('HH:mm');
}

function formatDateTime(dt) {
  return dt.toFormat('dd/MM/yyyy HH:mm');
}

function getDayName(dt) {
  return DAY_NAMES[dt.weekday % 7]; // luxon: 1=Mon..7=Sun
}

function getWorkingHours(dt) {
  const day = getDayName(dt);
  return config.workingHours[day] || null; // null = closed
}

/**
 * Returns all available 30-min slots for a given date (Israel timezone DateTime).
 * Does not check calendar — just generates time slots within working hours.
 */
function generateSlots(dt) {
  const hours = getWorkingHours(dt);
  if (!hours) return [];

  const [openH, openM] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);

  const slots = [];
  let current = dt.set({ hour: openH, minute: openM, second: 0, millisecond: 0 });
  const end = dt.set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 });

  const duration = config.slotDurationMinutes;
  while (current < end) {
    slots.push(current);
    current = current.plus({ minutes: duration });
  }
  return slots;
}

/**
 * Returns available booking dates starting from tomorrow, up to bookingWindowDays.
 */
function getAvailableDates() {
  const dates = [];
  let day = nowInIsrael().plus({ days: 1 }).startOf('day');
  const limit = config.bookingWindowDays;

  for (let i = 0; i < limit; i++) {
    const hours = getWorkingHours(day);
    if (hours) dates.push(day);
    day = day.plus({ days: 1 });
  }
  return dates;
}

/**
 * Parse "DD/MM" from user input. Returns a DateTime or null.
 */
function parseDateInput(input) {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, d, m] = match;
  const now = nowInIsrael();
  let dt = DateTime.fromObject({ year: now.year, month: parseInt(m), day: parseInt(d) }, { zone: TZ });
  // Roll over year if date is in the past
  if (dt < now.startOf('day')) dt = dt.plus({ years: 1 });
  return dt.isValid ? dt : null;
}

/**
 * Parse "HH:MM" from user input. Returns { hour, minute } or null.
 */
function parseTimeInput(input) {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function toISO(dt) {
  return dt.toISO();
}

function fromISO(isoStr) {
  return DateTime.fromISO(isoStr, { zone: TZ });
}

module.exports = {
  nowInIsrael,
  formatDate,
  formatTime,
  formatDateTime,
  generateSlots,
  getAvailableDates,
  parseDateInput,
  parseTimeInput,
  getWorkingHours,
  toISO,
  fromISO,
  TZ
};
