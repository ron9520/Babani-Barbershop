import { useState, useEffect, useCallback } from 'react';
import { useAdminApi } from '../../hooks/useApi.js';
import AppointmentCard from '../../components/AppointmentCard.jsx';

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

const STATUS_ACTIONS = {
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: [],
  no_show:   [],
  cancelled: []
};

const ACTION_LABELS = {
  completed: { label: '✅ הושלם', cls: 'bg-success/20 text-success text-xs px-2 py-1 rounded-lg' },
  no_show:   { label: '👻 לא הגיע', cls: 'bg-warning/20 text-warning text-xs px-2 py-1 rounded-lg' },
  cancelled: { label: '❌ בטל', cls: 'bg-danger/20 text-danger text-xs px-2 py-1 rounded-lg' }
};

export default function DayView() {
  const api = useAdminApi();
  const [date, setDate]           = useState(todayISO);
  const [appointments, setApts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [walkinOpen, setWalkin]   = useState(false);
  const [dayOff, setDayOff]       = useState(false);
  const [msg, setMsg]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/admin/appointments?date=${date}`);
      setApts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    try {
      await api.patch(`/admin/appointments/${id}/status`, { status });
      load();
    } catch (e) {
      alert('שגיאה: ' + e.message);
    }
  };

  const cancelDay = async () => {
    if (!confirm(`לבטל את כל התורים של ${formatDate(date)}?`)) return;
    try {
      await api.del(`/admin/appointments/day/${date}`);
      setMsg('✅ כל התורים בוטלו');
      load();
    } catch (e) {
      alert('שגיאה: ' + e.message);
    }
  };

  const confirmed = appointments.filter(a => a.status === 'confirmed');
  const others    = appointments.filter(a => a.status !== 'confirmed');
  const revenue   = appointments.filter(a => a.status === 'completed').reduce((s, a) => s + (a.servicePrice || 0), 0);

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setDate(d => addDays(d, -1))} className="text-muted text-2xl px-2">‹</button>
        <div className="text-center">
          <p className="font-bold">{formatDate(date)}</p>
          <button onClick={() => setDate(todayISO())} className="text-xs text-primary underline">היום</button>
        </div>
        <button onClick={() => setDate(d => addDays(d, 1))} className="text-muted text-2xl px-2">›</button>
      </div>

      {/* Summary bar */}
      {appointments.length > 0 && (
        <div className="card flex justify-around mb-4 py-3">
          <div className="text-center">
            <p className="text-xl font-bold text-primary">{appointments.length}</p>
            <p className="text-xs text-muted">תורים</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-success">{confirmed.length}</p>
            <p className="text-xs text-muted">מאושרים</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-warning">₪{revenue}</p>
            <p className="text-xs text-muted">הכנסה</p>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setWalkin(true)} className="flex-1 btn-primary text-sm py-2">
          + תור ווק-אין
        </button>
        {confirmed.length > 0 && (
          <button onClick={cancelDay} className="flex-1 btn-ghost text-sm py-2 border-danger text-danger">
            ❌ בטל היום
          </button>
        )}
      </div>

      {msg && <p className="text-success text-sm text-center mb-3">{msg}</p>}

      {/* Appointments */}
      {loading ? (
        <p className="text-center text-muted py-10">טוען...</p>
      ) : appointments.length === 0 ? (
        <div className="text-center py-14 text-muted">
          <p className="text-4xl mb-3">🗓</p>
          <p>אין תורים ליום זה</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...confirmed, ...others].map(apt => (
            <AppointmentCard
              key={apt.id}
              apt={apt}
              actions={
                STATUS_ACTIONS[apt.status]?.length > 0 ? (
                  STATUS_ACTIONS[apt.status].map(s => (
                    <button key={s} onClick={() => changeStatus(apt.id, s)} className={ACTION_LABELS[s].cls}>
                      {ACTION_LABELS[s].label}
                    </button>
                  ))
                ) : null
              }
            />
          ))}
        </div>
      )}

      {/* Walk-in modal */}
      {walkinOpen && <WalkinModal date={date} onClose={() => setWalkin(false)} onDone={load} api={api} />}
    </div>
  );
}

function WalkinModal({ date, onClose, onDone, api }) {
  const [services, setServices] = useState([]);
  const [form, setForm]         = useState({ customerName: '', phone: '', serviceId: '', timeDisplay: '' });
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    api.get('/services').then(setServices).catch(() => {});
  }, []);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const svc = services.find(s => s.id === form.serviceId);
      await api.post('/admin/appointments/walkin', {
        ...form,
        date,
        serviceName:  svc?.name,
        servicePrice: svc?.price
      });
      onDone();
      onClose();
    } catch (err) {
      alert('שגיאה: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className="bg-card w-full rounded-t-3xl p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg mb-4">הוסף תור ווק-אין</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className="input" placeholder="שם לקוח *" required
            value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
          <input className="input" placeholder="טלפון (אופציונלי)" type="tel"
            value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <select className="input" required value={form.serviceId}
            onChange={e => setForm(f => ({ ...f, serviceId: e.target.value }))}>
            <option value="">בחר שירות *</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name} — ₪{s.price}</option>)}
          </select>
          <input className="input" placeholder="שעה (למשל: 14:30) *" required
            value={form.timeDisplay} onChange={e => setForm(f => ({ ...f, timeDisplay: e.target.value }))} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-ghost">ביטול</button>
            <button type="submit" className="flex-1 btn-primary" disabled={loading}>
              {loading ? 'שומר...' : 'הוסף תור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
