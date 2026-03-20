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
  // Auto-expire sessions
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
  await getDb().collection('appointments').doc(appointmentId).update({ status: 'cancelled' });
  logger.info('Appointment cancelled in Firestore', { id: appointmentId });
}

/**
 * Get all confirmed appointments for a given date range (ISO strings).
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

async function updateAppointmentStatus(id, status) {
  const update = { status };
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
  // Soft-delete: mark as inactive
  await getDb().collection('services').doc(id).update({ active: false });
  logger.info('Service deactivated', { id });
}

/**
 * One-time migration: seeds Firestore `services` from config.json if collection is empty.
 */
async function migrateServicesIfNeeded(configServices) {
  const snap = await getDb().collection('services').limit(1).get();
  if (!snap.empty) return; // already migrated

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

// ─── Admin Config (default working hours) ─────────────────────────────────────

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

module.exports = {
  init,
  getSession,
  setSession,
  deleteSession,
  saveAppointment,
  getAppointmentById,
  getAppointmentByPhone,
  cancelAppointment,
  getAppointmentsInRange,
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
  updateDefaultHours
};
