# תוכנית עבודה — מספרת בבאני
**תאריך:** 20/03/2026
**סטטוס:** ✅ שלבים 1–4 הושלמו — Deployed ל-Render

---

## 🎯 סדר עדיפויות

```
שלב 1 → ניקיון קוד (הסרת WhatsApp/Twilio)
שלב 2 → תיקוני באגים קריטיים
שלב 3 → תיקוני אבטחה
שלב 4 → Build ו-Deploy ל-Render
שלב 5 → שיפורים (אחרי שהכל עובד)
```

---

## ~~שלב 1 — ניקיון קוד~~ ✅ הושלם (commit 077e98f)
**מטרה:** הסרת כל הקשור ל-Green-API ו-Twilio
**זמן משוער:** ~1 שעה

### א. מחיקת קבצים
- [ ] מחק את כל תיקיית `src/bot/`
  - `src/bot/flowController.js`
  - `src/bot/messageHandler.js`
  - `src/bot/sessionManager.js`
  - `src/bot/responses.js`
- [ ] מחק `src/services/whatsappService.js`
- [ ] מחק `src/services/twilioService.js`

### ב. עדכון `src/jobs/reminderJob.js`
- [ ] הסר את כל הקריאות ל-`whatsappService.sendMessage()`
- [ ] השאר רק: FCM push notifications + Google Calendar
- [ ] הסר `require` של whatsappService

### ג. עדכון `src/server.js`
- [ ] הסר webhook endpoint של WhatsApp (אם קיים)
- [ ] הסר את ה-import של whatsappService / twilioService
- [ ] הסר את endpoint `/api/admin/broadcast` (אם שולח WhatsApp)

### ד. עדכון `src/index.js`
- [ ] הסר אתחול Green-API / Twilio
- [ ] בדוק שאין require של bot modules

### ה. עדכון `.env` ו-`.env.example`
- [ ] הסר: `GREEN_API_INSTANCE_ID`, `GREEN_API_TOKEN`
- [ ] הסר: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE`
- [ ] הסר: `ADMIN_KEY` (מיותר לאחר תיקון באג #1 בטבלה)

### ו. עדכון `render.yaml`
- [ ] הסר את כל ENV vars של Green-API / Twilio

---

## ~~שלב 2 — תיקוני באגים קריטיים~~ ✅ הושלם (commit bbb3de9)
**מטרה:** תיקון שגיאות שעלולות לשבור את האפליקציה

### באג 1 — Firebase Private Key (עדיפות: גבוהה מאוד)
**קובץ:** `src/services/firebaseService.js` שורה ~14
**בעיה:** `.map(l => l.trim())` שובר את ה-private key
**תיקון:**
```js
// לפני:
privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').split('\n').map(l => l.trim()).join('\n')

// אחרי:
privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
```
> ⚠️ אם Firebase עובד כרגע — בדוק לפני שמשנים!

### באג 2 — Timezone בביטול תורים
**קובץ:** `src/server.js` שורה ~635
**בעיה:** `DateTime.fromISO(apt.startISO)` בלי timezone → חישוב שעות שגוי
**תיקון:**
```js
// לפני:
const hoursUntil = DateTime.fromISO(apt.startISO).diff(nowInIsrael(), 'hours').hours;

// אחרי:
const hoursUntil = DateTime.fromISO(apt.startISO, { zone: 'Asia/Jerusalem' }).diff(nowInIsrael(), 'hours').hours;
```

### באג 3 — Endpoint כפול
**קובץ:** `src/server.js`
**בעיה:** `GET /api/customer/appointments` מוגדר פעמיים
**תיקון:** חפש את שתי ההגדרות, מחק את השנייה (שורה ~610-626)

### באג 4 — Firestore Composite Index חסר
**בעיה:** שאילתת `status == 'confirmed' + startISO >=` → שגיאה בפרודקשן
**תיקון:** Firebase Console → Firestore → Indexes → Add:
- Collection: `appointments`
- Fields: `status` (Ascending), `startISO` (Ascending)

### באג 5 — authService.js — String Split לא בטוח
**קובץ:** `src/services/authService.js` שורות ~144, ~171
**בעיה:** `err.message.split(':')[1]` יחזיר `undefined` אם הפורמט שגוי
**תיקון:**
```js
const mins = (err.message.split(':')[1] || '10').trim();
```

---

## ~~שלב 3 — תיקוני אבטחה~~ ✅ הושלם (commit bbb3de9)
**מטרה:** סגירת חורים לפני deploy

### אבטחה 1 — Customer Login ללא OTP (דחוף!)
**קובץ:** `src/server.js`
**בעיה:** endpoint `/api/customer/phone-login` מחזיר token רק לפי מספר טלפון
**תיקון:** בטל את ה-endpoint לחלוטין — השתמש רק ב-OTP flow

### אבטחה 2 — הוסף CORS
**קובץ:** `src/server.js`
**תיקון:**
```js
const cors = require('cors');
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
```
הוסף ל-`package.json`: `"cors": "^2.8.5"`
הוסף ל-`.env`: `CLIENT_URL=https://your-app.onrender.com`

### אבטחה 3 — JWT Secret Validation
**קובץ:** `src/utils/validateEnv.js`
**תיקון:** הוסף בדיקה:
```js
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET חייב להיות לפחות 32 תווים');
}
```

### אבטחה 4 — Input Validation על יצירת שירות
**קובץ:** `src/server.js` — endpoint `POST /api/admin/services`
**תיקון:** הוסף:
```js
if (!name || price <= 0 || durationMinutes <= 0) {
  return res.status(400).json({ error: 'נתונים לא תקינים' });
}
```

---

## ~~שלב 4 — Build ו-Deploy~~ ✅ הושלם (commit bf14307)

### א. Build הפרויקט
```bash
cd BabaniBarberShop
npm run build
# מריץ: cd client && npm install && npm run build
# פלט: client/dist/
```

### ב. ENV Variables נדרשים ב-Render
```env
# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Google Calendar
GOOGLE_CALENDAR_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=

# JWT + Auth
JWT_SECRET=<32+ תווים אקראיים>
ADMIN_PIN=<4-6 ספרות>
BARBER_PHONE=972XXXXXXXXX

# App URLs
CLIENT_URL=https://your-app.onrender.com
SERVER_URL=https://your-app.onrender.com
GOOGLE_REVIEW_URL=https://g.page/r/YOUR_REVIEW_LINK
```

### ג. Deploy
```bash
git add .
git commit -m "Fix bugs, remove WhatsApp, add security patches"
git push
```

---

## שלב 5 — שיפורים עתידיים 💡
*לאחר שהכל עובד בפרודקשן*

- [ ] **Rate Limiting על OTP** — express-rate-limit per phone number
- [ ] **Request Logging Middleware** — log latency של כל endpoint
- [ ] **Firestore Session TTL** — שימוש ב-Firestore TTL במקום cleanup ידני
- [ ] **Frontend Token Expiry Check** — בדוק אם admin token פג תוקף בטעינה
- [ ] **npm audit** — עדכון firebase-admin ל-v12+
- [ ] **Error Boundary ב-React** — תפיסת שגיאות UI
- [ ] **Test Coverage** — Jest לפחות על OTP flow ו-appointment creation

---

## 📋 סיכום מהיר

| שלב | משימות | עדיפות |
|-----|--------|--------|
| 1 — ניקיון | הסרת WhatsApp/Twilio | 🔴 ראשון |
| 2 — באגים | 5 תיקונים קריטיים | 🔴 לפני deploy |
| 3 — אבטחה | 4 תיקונים | 🟠 לפני deploy |
| 4 — Deploy | Build + Render | 🟢 אחרי 1-3 |
| 5 — שיפורים | 7 שיפורים | 🔵 אחרי deploy |

**סה"כ עבודה משוערת לפני deploy: ~3-4 שעות**
