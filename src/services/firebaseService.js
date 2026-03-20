const admin = require('firebase-admin');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

let db;

function init() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').split('\n').map(l => l.trim()).join('\n')
    })
  });

  db = admin.firestore();
  logger.info('Firebase initialized');
}

function getDb() {
  if (!db) init();
  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function getSession(phone) {
  const doc = await getDb().collection('sessions').doc(phone).get();
  if (!doc.exists) return null;

  const data = doc.data();
  const timeoutMs = config.sessionTimeoutMinutes * 60 * 1000;
  if (Date.now() - data.updatedAt > timeoutMs) {
    await deleteSession(phone);
    return null;
  }
  return data;
}

async function setSession(phone, sessionData) {
  await getDb().collection('sessions').doc(phone).set({
    ...sessionData,
    updatedAt: Date.now()
  });
}

async function deleteSession(phone) {
  await getDb().collection('sessions').doc(phone).delete();
}

// ─── Appointments ─────────────────────────────────────────────────────────────

async function saveAppointment(appointment) {
  const ref = await getDb().collection('appointments').add({
    ...appointment,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Appointment saved to Firestore', { id: ref.id, phone: appointment.phone });
  return ref.id;
}

async function getAppointmentByPhone(phone) {
  const snap = await getDb()
    .collection('appointments')
    .where('phone', '==', phone)
    .where('status', '==', 'confirmed')
    .orderBy('startISO', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getAppointmentById(appointmentId) {
  const doc = await getDb().collection('appointments').doc(appointmentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function cancelAppointment(appointmentId) {
  await getDb().collection('appointments').doc(appointmentId).update({
    status: 'cancelled',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Appointment cancelled in Firestore', { id: appointmentId });
}

/**
 * Get CONFIRMED appointments for reminders / bot logic.
 */
async function getAppointmentsInRange(startISO, endISO) {
  const snap = await getDb()
    .collection('appointments')
    .where('status', '==', 'confirmed')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get ALL appointments (all statuses) for admin panel.
 * Uses only startISO range — no composite index needed.
 */
async function getAppointmentsInRangeAll(startISO, endISO) {
  const snap = await getDb()
    .collection('appointments')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get all appointments (upcoming + history) for a customer phone.
 */
async function getAllAppointmentsByPhone(phone) {
  const snap = await getDb()
    .collection('appointments')
    .where('phone', '==', phone)
    .orderBy('startISO', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateAppointmentStatus(id, status, extra = {}) {
  const update = { status, ...extra };
  if (status === 'completed') update.completedAt = admin.firestore.FieldValue.serverTimestamp();
  if (status === 'cancelled') update.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
  await getDb().collection('appointments').doc(id).update(update);
  logger.info('Appointment status updated', { id, status });
}

async function clearAllData() {
  const db = getDb();
  const [appointmentsSnap, sessionsSnap] = await Promise.all([
    db.collection('appointments').get(),
    db.collection('sessions').get()
  ]);

  const batch = db.batch();
  appointmentsSnap.docs.forEach(doc => batch.delete(doc.ref));
  sessionsSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  return appointmentsSnap.size;
}

// ─── Services (dynamic price list) ───────────────────────────────────────────

async function getServices() {
  const snap = await getDb().collection('services')
    .where('active', '==', true)
    .orderBy('order')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getServiceById(id) {
  const doc = await getDb().collection('services').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function createService({ id, name, price, durationMinutes, order }) {
  const ref = id
    ? getDb().collection('services').doc(id)
    : getDb().collection('services').doc();
  await ref.set({
    name,
    price: Number(price),
    durationMinutes: Number(durationMinutes),
    order: Number(order) || 0,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Service created', { id: ref.id, name });
  return ref.id;
}

async function updateService(id, fields) {
  const allowed = ['name', 'price', 'durationMinutes', 'order', 'active'];
  const update  = {};
  for (const k of allowed) {
    if (fields[k] !== undefined) update[k] = fields[k];
  }
  if (update.price !== undefined) update.price = Number(update.price);
  if (update.durationMinutes !== undefined) update.durationMinutes = Number(update.durationMinutes);
  await getDb().collection('services').doc(id).update(update);
  logger.info('Service updated', { id, fields: Object.keys(update) });
}

async function deleteService(id) {
  await getDb().collection('services').doc(id).update({ active: false });
  logger.info('Service deactivated', { id });
}

async function migrateServicesIfNeeded(configServices) {
  const snap = await getDb().collection('services').limit(1).get();
  if (!snap.empty) return;

  const batch = getDb().batch();
  configServices.forEach((s, i) => {
    const ref = getDb().collection('services').doc(s.id);
    batch.set(ref, {
      name: s.name,
      price: s.price,
      durationMinutes: s.durationMinutes,
      order: i,
      active: true
    });
  });
  await batch.commit();
  logger.info('Services migrated from config.json to Firestore', { count: configServices.length });
}

// ─── Schedule Overrides ───────────────────────────────────────────────────────

async function getScheduleOverride(dateISO) {
  const doc = await getDb().collection('schedule_overrides').doc(dateISO).get();
  return doc.exists ? doc.data() : null;
}

async function setScheduleOverride({ date, open, close, closed, reason }) {
  await getDb().collection('schedule_overrides').doc(date).set({
    date,
    open:   closed ? null : open,
    close:  closed ? null : close,
    closed: closed || false,
    reason: reason || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Schedule override set', { date, closed });
}

async function deleteScheduleOverride(dateISO) {
  await getDb().collection('schedule_overrides').doc(dateISO).delete();
  logger.info('Schedule override deleted', { date: dateISO });
}

async function getUpcomingOverrides() {
  const today  = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snap = await getDb().collection('schedule_overrides')
    .where('date', '>=', today)
    .where('date', '<=', future)
    .orderBy('date')
    .get();
  return snap.docs.map(d => d.data());
}

// ─── Admin Config ─────────────────────────────────────────────────────────────

async function getAdminConfig() {
  const doc = await getDb().collection('admin_config').doc('settings').get();
  return doc.exists ? doc.data() : null;
}

async function updateDefaultHours(day, open, close) {
  await getDb().collection('admin_config').doc('settings').set(
    { workingHours: { [day]: { open, close } } },
    { merge: true }
  );
  logger.info('Default hours updated', { day, open, close });
}

// ─── Customer Profile ─────────────────────────────────────────────────────────

/**
 * Get or build customer profile from appointments collection.
 * customers/{phone} stores: name, notes, isBlocked, blockedReason, visitCount, lastVisitDate
 */
async function getCustomerProfile(phone) {
  const [profileDoc, appointmentsSnap] = await Promise.all([
    getDb().collection('customers').doc(phone).get(),
    getDb().collection('appointments')
      .where('phone', '==', phone)
      .where('status', '==', 'completed')
      .get()
  ]);

  const profile = profileDoc.exists ? profileDoc.data() : {};
  const visitCount = appointmentsSnap.size;

  // Get last appointment (any status) for the name
  const allSnap = await getDb().collection('appointments')
    .where('phone', '==', phone)
    .orderBy('startISO', 'desc')
    .limit(1)
    .get();

  const lastApt = allSnap.empty ? null : allSnap.docs[0].data();

  return {
    phone,
    name: profile.name || lastApt?.customerName || null,
    notes: profile.notes || '',
    isBlocked: profile.isBlocked || false,
    blockedReason: profile.blockedReason || '',
    visitCount,
    lastVisitDate: lastApt?.dateDisplay || null,
    preferredService: profile.preferredService || lastApt?.serviceName || null
  };
}

async function upsertCustomerProfile(phone, fields) {
  await getDb().collection('customers').doc(phone).set(fields, { merge: true });
  logger.info('Customer profile updated', { phone, fields: Object.keys(fields) });
}

async function blockCustomer(phone, reason) {
  await upsertCustomerProfile(phone, {
    isBlocked: true,
    blockedReason: reason || '',
    blockedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Customer blocked', { phone, reason });
}

async function unblockCustomer(phone) {
  await upsertCustomerProfile(phone, {
    isBlocked: false,
    blockedReason: '',
    blockedAt: null
  });
  logger.info('Customer unblocked', { phone });
}

async function isCustomerBlocked(phone) {
  const doc = await getDb().collection('customers').doc(phone).get();
  return doc.exists && doc.data().isBlocked === true;
}

// ─── Waiting List ─────────────────────────────────────────────────────────────

async function addToWaitingList({ date, phone, customerName, serviceId, serviceName }) {
  // Check if already in waiting list for this date
  const existing = await getDb().collection('waiting_list')
    .where('date', '==', date)
    .where('phone', '==', phone)
    .get();
  if (!existing.empty) return existing.docs[0].id;

  const ref = await getDb().collection('waiting_list').add({
    date,
    phone,
    customerName,
    serviceId,
    serviceName,
    notified: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Added to waiting list', { date, phone });
  return ref.id;
}

async function getWaitingListForDate(date) {
  const snap = await getDb().collection('waiting_list')
    .where('date', '==', date)
    .where('notified', '==', false)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function removeFromWaitingList(id) {
  await getDb().collection('waiting_list').doc(id).delete();
  logger.info('Removed from waiting list', { id });
}

async function markWaitingListNotified(id) {
  await getDb().collection('waiting_list').doc(id).update({ notified: true });
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

/**
 * Get unique phone numbers of customers who had appointments in the last N days.
 */
async function getBroadcastRecipients(daysSince = 30) {
  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000).toISOString();
  const snap = await getDb().collection('appointments')
    .where('createdAt', '>=', since)
    .get();

  const phones = new Set();
  snap.docs.forEach(d => {
    const phone = d.data().phone;
    if (phone) phones.add(phone);
  });
  return Array.from(phones);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function getStatsData(startISO, endISO) {
  const snap = await getDb().collection('appointments')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();

  const appointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const total      = appointments.length;
  const completed  = appointments.filter(a => a.status === 'completed').length;
  const confirmed  = appointments.filter(a => a.status === 'confirmed').length;
  const cancelled  = appointments.filter(a => a.status === 'cancelled').length;
  const noShow     = appointments.filter(a => a.status === 'no_show').length;

  // Revenue
  const totalRevenue    = appointments
    .filter(a => a.status === 'completed')
    .reduce((sum, a) => sum + (a.servicePrice || 0), 0);
  const expectedRevenue = appointments
    .filter(a => ['confirmed', 'completed'].includes(a.status))
    .reduce((sum, a) => sum + (a.servicePrice || 0), 0);

  // Popular services
  const serviceCount = {};
  appointments.filter(a => a.status !== 'cancelled').forEach(a => {
    const name = a.serviceName || 'לא ידוע';
    serviceCount[name] = (serviceCount[name] || 0) + 1;
  });
  const popularServices = Object.entries(serviceCount)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // Peak hours
  const hourCount = {};
  appointments.filter(a => a.status !== 'cancelled').forEach(a => {
    if (a.timeDisplay) {
      const hour = a.timeDisplay.split(':')[0] + ':00';
      hourCount[hour] = (hourCount[hour] || 0) + 1;
    }
  });
  const peakHours = Object.entries(hourCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, count }));

  // Daily revenue (for chart)
  const dailyMap = {};
  appointments.filter(a => a.status === 'completed').forEach(a => {
    const date = a.startISO ? a.startISO.slice(0, 10) : null;
    if (date) dailyMap[date] = (dailyMap[date] || 0) + (a.servicePrice || 0);
  });
  const dailyRevenue = Object.entries(dailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, revenue]) => ({ date, revenue }));

  return {
    total, completed, confirmed, cancelled, noShow,
    totalRevenue, expectedRevenue,
    popularServices, peakHours, dailyRevenue
  };
}

module.exports = {
  init,
  getSession,
  setSession,
  deleteSession,
  saveAppointment,
  getAppointmentById,
  getAppointmentByPhone,
  getAllAppointmentsByPhone,
  cancelAppointment,
  getAppointmentsInRange,
  getAppointmentsInRangeAll,
  updateAppointmentStatus,
  clearAllData,
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  migrateServicesIfNeeded,
  getScheduleOverride,
  setScheduleOverride,
  deleteScheduleOverride,
  getUpcomingOverrides,
  getAdminConfig,
  updateDefaultHours,
  getCustomerProfile,
  upsertCustomerProfile,
  blockCustomer,
  unblockCustomer,
  isCustomerBlocked,
  addToWaitingList,
  getWaitingListForDate,
  removeFromWaitingList,
  markWaitingListNotified,
  getBroadcastRecipients,
  getStatsData
};
