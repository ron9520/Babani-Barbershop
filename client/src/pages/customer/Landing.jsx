import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

// ── Booking Wizard steps ────────────────────────────────────────────────────
// 1. Service  2. Date  3. Time  4. Name  5. Confirm  6. Done

export default function Landing() {
  const { isCustomer } = useAuth();
  const navigate       = useNavigate();
  const [step, setStep]     = useState(0); // 0 = home
  const [booking, setBooking] = useState({});

  if (step === 0) {
    return <Home onBook={() => setStep(1)} onMyApts={() => isCustomer ? navigate('/my-appointments') : navigate('/login')} />;
  }

  if (step >= 1 && step <= 5) {
    return (
      <BookingWizard
        step={step}
        booking={booking}
        setBooking={setBooking}
        onNext={() => setStep(s => s + 1)}
        onBack={() => step === 1 ? setStep(0) : setStep(s => s - 1)}
        onDone={() => setStep(6)}
      />
    );
  }

  const handleRepeat = () => {
    // Keep the service, clear date and time
    setBooking(b => ({
      ...b,
      date: undefined,
      dateDisplay: undefined,
      time: undefined,
      timeDisplay: undefined
    }));
    setStep(2); // Go to DateStep
  };

  return (
    <BookingDone
      onHome={() => { setStep(0); setBooking({}); }}
      onRepeat={handleRepeat}
    />
  );
}

// ── Home screen ─────────────────────────────────────────────────────────────

const PHONE     = '0524323233';
const PHONE_INT = '972524323233';
const ADDRESS   = 'מעגל השלום 9 ראשון לציון';
const WAZE_URL  = `https://waze.com/ul?q=${encodeURIComponent(ADDRESS + ' פרס נובל')}&navigate=yes`;

function Home({ onBook, onMyApts }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">💈</div>
        <h1 className="text-3xl font-extrabold tracking-tight">מספרת בבאני</h1>
        <p className="text-muted mt-2 text-base">Look Sharp. Feel Sharp.</p>
        <div className="w-16 h-1 bg-primary rounded-full mt-4 mb-8" />

        <button onClick={onBook} className="btn-primary w-full max-w-xs text-base py-4 mb-3">
          📅 קבע תור עכשיו
        </button>
        <button onClick={onMyApts} className="btn-ghost w-full max-w-xs text-base py-4">
          👤 התורים שלי
        </button>
      </div>

      {/* Contact bar */}
      <div className="px-4 pb-safe pb-6">
        <div className="card flex items-center justify-around gap-2 py-3">
          {/* Phone */}
          <a href={`tel:${PHONE}`}
            className="flex flex-col items-center gap-1 text-primary active:opacity-70 transition-opacity">
            <span className="text-2xl">📞</span>
            <span className="text-xs font-medium">{PHONE}</span>
          </a>

          <div className="w-px h-10 bg-border" />

          {/* Address */}
          <div className="flex flex-col items-center gap-1 text-muted text-xs text-center">
            <span className="text-2xl">📍</span>
            <span>{ADDRESS}</span>
          </div>

          <div className="w-px h-10 bg-border" />

          {/* Waze */}
          <a href={WAZE_URL} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 text-primary active:opacity-70 transition-opacity">
            <span className="text-2xl">🗺️</span>
            <span className="text-xs font-medium">Waze</span>
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Wizard shell ─────────────────────────────────────────────────────────────

function BookingWizard({ step, booking, setBooking, onNext, onBack, onDone }) {
  const steps = [null, ServiceStep, DateStep, TimeStep, NameStep, ConfirmStep];
  const Step  = steps[step];

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Progress */}
      <div className="flex items-center gap-2 px-4 pt-safe pt-4 pb-2">
        <button onClick={onBack} className="text-muted text-xl ml-1">‹</button>
        <div className="flex-1 flex gap-1">
          {[1,2,3,4,5].map(s => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-surface'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 overflow-auto animate-fadeIn">
        <Step booking={booking} setBooking={setBooking} onNext={onNext} onDone={onDone} />
      </div>
    </div>
  );
}

// ── Step 1: Service ──────────────────────────────────────────────────────────

function ServiceStep({ booking, setBooking, onNext }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(setServices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const select = svc => {
    setBooking(b => ({ ...b, serviceId: svc.id, serviceName: svc.name, servicePrice: svc.price, duration: svc.durationMinutes }));
    onNext();
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-bold mb-1">בחר שירות</h2>
      <p className="text-muted text-sm mb-5">מה תרצה לעשות?</p>
      {loading ? <p className="text-center text-muted py-10">טוען...</p> : (
        <div className="flex flex-col gap-3">
          {services.map(svc => (
            <button key={svc.id} onClick={() => select(svc)}
              className="card border border-surface active:border-primary active:scale-95 transition-all text-right">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{svc.name}</p>
                  <p className="text-muted text-sm">{svc.durationMinutes} דקות</p>
                </div>
                <p className="text-primary font-bold text-lg">₪{svc.price}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: Date ─────────────────────────────────────────────────────────────

function DateStep({ booking, setBooking, onNext }) {
  const [dates, setDates]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/available-dates?serviceId=${booking.serviceId}`)
      .then(r => r.json())
      .then(d => setDates(d.dates || d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const select = date => {
    setBooking(b => ({ ...b, date, dateDisplay: new Date(date + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) }));
    onNext();
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-bold mb-1">בחר תאריך</h2>
      <p className="text-muted text-sm mb-5">מתי נוח לך?</p>
      {loading ? <p className="text-center text-muted py-10">טוען...</p> : dates.length === 0 ? (
        <div className="text-center py-14 text-muted">
          <p className="text-4xl mb-3">😔</p>
          <p>אין זמינות בשבועות הקרובים</p>
          <p className="text-xs mt-1">נסה שוב מאוחר יותר</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {dates.map(d => (
            <button key={d} onClick={() => select(d)}
              className="card border border-surface active:border-primary active:scale-95 transition-all text-right py-3">
              {new Date(d + 'T12:00:00Z').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Time ─────────────────────────────────────────────────────────────

function TimeStep({ booking, setBooking, onNext }) {
  const [slots, setSlots]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/available-slots?date=${booking.date}&serviceId=${booking.serviceId}`)
      .then(r => r.json())
      .then(d => setSlots(d.slots || d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const select = slot => {
    setBooking(b => ({ ...b, time: slot, timeDisplay: slot }));
    onNext();
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-bold mb-1">בחר שעה</h2>
      <p className="text-muted text-sm mb-1">{booking.dateDisplay}</p>
      <p className="text-xs text-muted mb-5">{booking.serviceName}</p>
      {loading ? <p className="text-center text-muted py-10">טוען...</p> : slots.length === 0 ? (
        <div className="text-center py-14 text-muted">
          <p className="text-4xl mb-3">😔</p>
          <p>אין זמינות ביום זה</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {slots.map(slot => (
            <button key={slot} onClick={() => select(slot)}
              className="bg-card border border-surface rounded-xl py-3 text-center font-semibold active:bg-primary active:text-white active:border-primary transition-colors">
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 4: Name ─────────────────────────────────────────────────────────────

function NameStep({ booking, setBooking, onNext }) {
  const [name, setName]   = useState(booking.customerName || '');
  const [phone, setPhone] = useState(booking.phone || '');

  const submit = e => {
    e.preventDefault();
    setBooking(b => ({ ...b, customerName: name, phone }));
    onNext();
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-bold mb-1">פרטי יצירת קשר</h2>
      <p className="text-muted text-sm mb-5">כדי לאשר את התור</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="text-sm text-muted mb-1 block">שם *</label>
          <input className="input" placeholder="השם שלך" required value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-muted mb-1 block">טלפון *</label>
          <input className="input" placeholder="0501234567" type="tel" dir="ltr" required value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ''))} />
          <p className="text-xs text-muted mt-1">כדי לשמור ולבטל תורים</p>
        </div>
        <button type="submit" className="btn-primary mt-2">המשך</button>
      </form>
    </div>
  );
}

// ── Step 5: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({ booking, onNext, onDone }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(booking)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בקביעת תור');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-4">
      <h2 className="text-xl font-bold mb-5">אישור תור</h2>
      <div className="card mb-6 flex flex-col gap-3">
        <Row icon="✂️" label="שירות" value={`${booking.serviceName} — ₪${booking.servicePrice}`} />
        <Row icon="📅" label="תאריך" value={booking.dateDisplay} />
        <Row icon="🕐" label="שעה"   value={booking.timeDisplay} />
        <Row icon="👤" label="שם"    value={booking.customerName} />
        <Row icon="📱" label="טלפון" value={booking.phone} dir="ltr" />
      </div>

      {error && <p className="text-danger text-sm mb-3 text-center">{error}</p>}

      <button onClick={confirm} className="btn-primary w-full text-base py-4" disabled={loading}>
        {loading ? 'קובע תור...' : '✅ אשר תור'}
      </button>
    </div>
  );
}

function Row({ icon, label, value, dir }) {
  return (
    <div className="flex gap-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-semibold text-sm" dir={dir}>{value}</p>
      </div>
    </div>
  );
}

// ── Step 6: Done ─────────────────────────────────────────────────────────────

function BookingDone({ onHome, onRepeat }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl mb-4">✅</div>
      <h1 className="text-2xl font-bold">התור נקבע!</h1>
      <p className="text-muted mt-2">התור אושר! נתראה במספרה 💈</p>
      <div className="w-16 h-1 bg-primary rounded-full mt-4 mb-8" />
      <button onClick={onRepeat} className="btn-primary w-full max-w-xs mb-2">
        קבע תור חוזר
      </button>
      <button onClick={onHome} className="btn-ghost w-full max-w-xs">
        חזרה לדף הבית
      </button>
    </div>
  );
}
