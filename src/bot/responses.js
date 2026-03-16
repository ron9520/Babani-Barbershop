const config = require('../../config/config.json');

const shop = config.shop.name;

function welcome() {
  return (
    `✂️ *ברוך הבא ל${shop}!*\n\n` +
    `במה אני יכול לעזור לך?\n\n` +
    `1️⃣ קביעת תור\n` +
    `2️⃣ ביטול תור\n\n` +
    `_שלח מספר לבחירה_`
  );
}

function chooseService() {
  const list = config.services
    .map((s, i) => `${i + 1}️⃣ ${s.name} — ₪${s.price} (${s.durationMinutes} דק')`)
    .join('\n');
  return `✂️ *בחר שירות:*\n\n${list}\n\n_שלח מספר לבחירה_`;
}

function chooseDate(dates) {
  const DAY_HE = ['', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת', 'ראשון'];
  const list = dates
    .slice(0, 7)
    .map((d, i) => `${i + 1}️⃣ ${d.toFormat('dd/MM')} (יום ${DAY_HE[d.weekday]})`)
    .join('\n');
  return `📅 *בחר תאריך:*\n\n${list}\n\n_שלח מספר לבחירה, או הקלד תאריך בפורמט DD/MM_`;
}

function chooseTime(slots, busyTimes) {
  const available = slots.filter(s => !busyTimes.includes(s.toFormat('HH:mm')));
  if (available.length === 0) {
    return '😔 אין שעות פנויות ביום זה. אנא בחר תאריך אחר.';
  }
  const list = available.map((s, i) => `${i + 1}️⃣ ${s.toFormat('HH:mm')}`).join('\n');
  return `🕐 *בחר שעה:*\n\n${list}\n\n_שלח מספר לבחירה_`;
}

function enterName() {
  return `👤 *מה שמך?*\n\n_הקלד את שמך המלא_`;
}

function confirmAppointment({ serviceName, servicePrice, dateDisplay, timeDisplay, customerName }) {
  return (
    `✅ *אישור תור*\n\n` +
    `👤 שם: ${customerName}\n` +
    `💈 שירות: ${serviceName}\n` +
    `📅 תאריך: ${dateDisplay}\n` +
    `🕐 שעה: ${timeDisplay}\n` +
    `💰 מחיר: ₪${servicePrice}\n\n` +
    `לאישור שלח *כן*, לביטול שלח *לא*`
  );
}

function appointmentBooked({ serviceName, dateDisplay, timeDisplay }) {
  return (
    `🎉 *התור נקבע בהצלחה!*\n\n` +
    `📅 ${dateDisplay} בשעה ${timeDisplay}\n` +
    `💈 ${serviceName}\n\n` +
    `📍 ${shop}\n` +
    `_ביום שלפני התור תקבל תזכורת_\n\n` +
    `כדי לבטל תור שלח *ביטול*`
  );
}

function appointmentCancelled() {
  return `🗑️ התורשבוטל בהצלחה. נשמח לראותך שוב! 😊`;
}

function noAppointmentFound() {
  return `🔍 לא מצאתי תור פעיל על המספר שלך.`;
}

function slotTaken() {
  return `😔 מצטערים, השעה הזו כבר נתפסה. אנא בחר שעה אחרת.`;
}

function reminder({ customerName, serviceName, dateDisplay, timeDisplay }) {
  return (
    `⏰ *תזכורת לתור מחר!*\n\n` +
    `שלום ${customerName} 👋\n\n` +
    `מחכים לך מחר:\n` +
    `📅 ${dateDisplay} | 🕐 ${timeDisplay}\n` +
    `💈 ${serviceName}\n\n` +
    `📍 ${shop}\n\n` +
    `להסברים: שלח הודעה או צור קשר עם הספר ישירות.`
  );
}

function error() {
  return `😕 משהו השתבש מצידנו. אנא נסה שוב בעוד דקה.`;
}

function invalidInput() {
  return `❓ לא הבנתי את הבחירה. אנא שלח מספר תקין מהרשימה.`;
}

function cancelled() {
  return `↩️ הפעולה בוטלה. שלח *היי* להתחלה מחדש.`;
}

module.exports = {
  welcome,
  chooseService,
  chooseDate,
  chooseTime,
  enterName,
  confirmAppointment,
  appointmentBooked,
  appointmentCancelled,
  noAppointmentFound,
  slotTaken,
  reminder,
  error,
  invalidInput,
  cancelled
};
