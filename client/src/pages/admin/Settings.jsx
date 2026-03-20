import { useState, useEffect } from 'react';
import { useAdminApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function Settings() {
  const api      = useAdminApi();
  const { logoutAdmin } = useAuth();
  const navigate = useNavigate();

  const [schedule, setSchedule]   = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [ovForm, setOvForm]       = useState({ date: '', open: '09:00', close: '19:00', closed: false, reason: '' });
  const [saved, setSaved]         = useState('');
  const [broadcastMsg, setBroadcast] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/schedule');
      setSchedule(data?.defaultHours || {});
      setOverrides(data?.overrides || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveHours = async (day, open, close) => {
    try {
      await api.put('/admin/schedule/default', { day, open, close });
      setSaved('✅ נשמר');
      setTimeout(() => setSaved(''), 2000);
    } catch (e) {
      alert('שגיאה: ' + e.message);
    }
  };

  const addOverride = async e => {
    e.preventDefault();
    try {
      await api.post('/admin/schedule/override', ovForm);
      setOvForm({ date: '', open: '09:00', close: '19:00', closed: false, reason: '' });
      load();
    } catch (err) {
      alert('שגיאה: ' + err.message);
    }
  };

  const deleteOverride = async (date) => {
    if (!confirm('למחוק את ה-override?')) return;
    await api.del(`/admin/schedule/override/${date}`);
    load();
  };

  const sendBroadcast = async e => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    if (!confirm('לשלוח הודעה לכל הלקוחות?')) return;
    setBroadcasting(true);
    try {
      await api.post('/admin/broadcast', { message: broadcastMsg });
      setBroadcast('');
      setSaved('✅ ההודעה נשלחה');
      setTimeout(() => setSaved(''), 3000);
    } catch (e) {
      alert('שגיאה: ' + e.message);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleLogout = () => {
    logoutAdmin();
    navigate('/admin/login');
  };

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <h1 className="text-xl font-bold mb-5">⚙️ הגדרות</h1>

      {saved && <p className="text-success text-sm mb-3">{saved}</p>}

      {/* Working hours */}
      <section className="card mb-4">
        <h2 className="font-semibold mb-3">🕐 שעות עבודה קבועות</h2>
        {loading ? <p className="text-muted text-sm">טוען...</p> : (
          <div className="flex flex-col gap-3">
            {DAYS_HE.map((dayHe, i) => {
              const key = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][i];
              const h   = schedule?.[key] || { open: '09:00', close: '19:00' };
              return (
                <HoursRow key={key} label={dayHe} defaultOpen={h.open} defaultClose={h.close}
                  onSave={(open, close) => saveHours(key, open, close)} />
              );
            })}
          </div>
        )}
      </section>

      {/* One-time override */}
      <section className="card mb-4">
        <h2 className="font-semibold mb-3">📅 שינוי חד-פעמי לתאריך</h2>
        <form onSubmit={addOverride} className="flex flex-col gap-2">
          <input type="date" className="input" required
            value={ovForm.date} onChange={e => setOvForm(f => ({ ...f, date: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ovForm.closed}
              onChange={e => setOvForm(f => ({ ...f, closed: e.target.checked }))} />
            יום סגור
          </label>
          {!ovForm.closed && (
            <div className="flex gap-2">
              <input type="time" className="input flex-1" value={ovForm.open}
                onChange={e => setOvForm(f => ({ ...f, open: e.target.value }))} />
              <input type="time" className="input flex-1" value={ovForm.close}
                onChange={e => setOvForm(f => ({ ...f, close: e.target.value }))} />
            </div>
          )}
          <input className="input" placeholder="סיבה (אופציונלי)"
            value={ovForm.reason} onChange={e => setOvForm(f => ({ ...f, reason: e.target.value }))} />
          <button type="submit" className="btn-primary text-sm py-2">הוסף שינוי</button>
        </form>

        {overrides.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted">שינויים קרובים:</p>
            {overrides.map(ov => (
              <div key={ov.date} className="flex justify-between items-center bg-surface rounded-xl px-3 py-2 text-sm">
                <div>
                  <span className="font-semibold">{ov.date}</span>
                  {ov.closed
                    ? <span className="text-danger mr-2">— סגור</span>
                    : <span className="text-muted mr-2">— {ov.open} עד {ov.close}</span>
                  }
                  {ov.reason && <span className="text-muted text-xs block">{ov.reason}</span>}
                </div>
                <button onClick={() => deleteOverride(ov.date)} className="text-danger text-xs">מחק</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Broadcast */}
      <section className="card mb-4">
        <h2 className="font-semibold mb-3">📢 הודעה לכל הלקוחות</h2>
        <form onSubmit={sendBroadcast} className="flex flex-col gap-2">
          <textarea
            className="input min-h-[80px] resize-none"
            placeholder="כתוב הודעה לשליחה לכל לקוחות 30 יום האחרונים..."
            value={broadcastMsg}
            onChange={e => setBroadcast(e.target.value)}
          />
          <button type="submit" className="btn-primary text-sm py-2" disabled={broadcasting || !broadcastMsg.trim()}>
            {broadcasting ? 'שולח...' : '📤 שלח הודעה'}
          </button>
        </form>
      </section>

      {/* Logout */}
      <button onClick={handleLogout} className="w-full btn-ghost border-danger text-danger">
        יציאה מהפאנל
      </button>
    </div>
  );
}

function HoursRow({ label, defaultOpen, defaultClose, onSave }) {
  const [open,  setOpen]  = useState(defaultOpen);
  const [close, setClose] = useState(defaultClose);

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-sm text-muted shrink-0">{label}</span>
      <input type="time" className="input flex-1 py-1.5 text-sm" value={open}
        onChange={e => setOpen(e.target.value)} />
      <span className="text-muted text-sm">–</span>
      <input type="time" className="input flex-1 py-1.5 text-sm" value={close}
        onChange={e => setClose(e.target.value)} />
      <button onClick={() => onSave(open, close)}
        className="text-primary text-sm font-semibold px-2 py-1 rounded-lg active:opacity-70">
        שמור
      </button>
    </div>
  );
}
