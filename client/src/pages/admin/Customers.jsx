import { useState } from 'react';
import { useAdminApi } from '../../hooks/useApi.js';

export default function Customers() {
  const api = useAdminApi();
  const [phone, setPhone]       = useState('');
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [notes, setNotes]       = useState('');
  const [editNotes, setEditNotes] = useState(false);
  const [msg, setMsg]           = useState('');

  const search = async e => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setProfile(null);
    try {
      const p = await api.get(`/admin/customers/${phone.trim()}`);
      setProfile(p);
      setNotes(p.notes || '');
    } catch (err) {
      setMsg('לא נמצא לקוח: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    await api.patch(`/admin/customers/${profile.phone}`, { notes });
    setProfile(p => ({ ...p, notes }));
    setEditNotes(false);
    flash('✅ הערות נשמרו');
  };

  const block = async () => {
    const reason = prompt('סיבת חסימה (אופציונלי):') ?? '';
    await api.patch(`/admin/customers/${profile.phone}`, { isBlocked: true, blockedReason: reason });
    setProfile(p => ({ ...p, isBlocked: true, blockedReason: reason }));
    flash('🚫 לקוח נחסם');
  };

  const unblock = async () => {
    await api.patch(`/admin/customers/${profile.phone}`, { isBlocked: false, blockedReason: '' });
    setProfile(p => ({ ...p, isBlocked: false, blockedReason: '' }));
    flash('✅ חסימה הוסרה');
  };

  const flash = text => { setMsg(text); setTimeout(() => setMsg(''), 2500); };

  const exportCSV = async () => {
    try {
      const res = await fetch('/api/admin/customers/export', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
      });
      if (!res.ok) {
        flash('❌ שגיאה בייצוא');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      flash('✅ הלקוחות יוצאו בהצלחה');
    } catch (err) {
      flash('❌ ' + err.message);
    }
  };

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">👤 פרופיל לקוח</h1>
        <button onClick={exportCSV} className="text-xs btn-ghost py-1.5 px-3">
          ⬇️ CSV
        </button>
      </div>

      <form onSubmit={search} className="flex gap-2 mb-4">
        <input
          className="input flex-1" type="tel" dir="ltr"
          placeholder="מספר טלפון (972...)"
          value={phone} onChange={e => setPhone(e.target.value)}
        />
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={loading}>
          {loading ? '...' : 'חפש'}
        </button>
      </form>

      {msg && <p className="text-sm mb-3 text-success">{msg}</p>}

      {profile && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Profile card */}
          <div className="card">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{profile.isBlocked ? '🚫' : '👤'}</span>
              <div>
                <p className="font-bold text-lg">{profile.name || 'לא ידוע'}</p>
                <p className="text-muted text-sm" dir="ltr">{profile.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center bg-surface rounded-xl py-2">
                <p className="font-bold text-primary">{profile.visitCount}</p>
                <p className="text-xs text-muted">ביקורים</p>
              </div>
              <div className="text-center bg-surface rounded-xl py-2">
                <p className="font-bold text-text text-sm">{profile.lastVisitDate || '—'}</p>
                <p className="text-xs text-muted">ביקור אחרון</p>
              </div>
              <div className="text-center bg-surface rounded-xl py-2">
                <p className="font-bold text-text text-sm truncate px-1">{profile.preferredService || '—'}</p>
                <p className="text-xs text-muted">שירות אחרון</p>
              </div>
            </div>

            {profile.isBlocked && (
              <div className="mt-3 bg-danger/10 rounded-xl p-3">
                <p className="text-danger text-sm font-semibold">🚫 לקוח חסום</p>
                {profile.blockedReason && <p className="text-danger/70 text-xs mt-1">{profile.blockedReason}</p>}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <p className="font-semibold text-sm">📝 הערות</p>
              <button onClick={() => setEditNotes(!editNotes)} className="text-primary text-xs">
                {editNotes ? 'ביטול' : 'ערוך'}
              </button>
            </div>
            {editNotes ? (
              <>
                <textarea
                  className="input text-sm min-h-[80px] resize-none"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="הוסף הערה על הלקוח..."
                />
                <button onClick={saveNotes} className="mt-2 btn-primary text-sm py-2 w-full">שמור הערות</button>
              </>
            ) : (
              <p className="text-muted text-sm">{profile.notes || 'אין הערות'}</p>
            )}
          </div>

          {/* Block / Unblock */}
          <div className="flex gap-2">
            {profile.isBlocked
              ? <button onClick={unblock} className="flex-1 btn-primary text-sm py-2">✅ הסר חסימה</button>
              : <button onClick={block} className="flex-1 border border-danger text-danger rounded-xl py-2 text-sm active:opacity-70">🚫 חסום לקוח</button>
            }
          </div>
        </div>
      )}
    </div>
  );
}
