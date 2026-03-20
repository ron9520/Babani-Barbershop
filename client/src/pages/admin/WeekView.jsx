import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminApi } from '../../hooks/useApi.js';

function getMondayOfWeek(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatShort(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

export default function WeekView() {
  const api        = useAdminApi();
  const navigate   = useNavigate();
  const today      = todayISO();
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(today));
  const [apts, setApts]           = useState([]);
  const [loading, setLoading]     = useState(false);

  const weekEnd = addDays(weekStart, 6);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/appointments?from=${weekStart}&to=${weekEnd}`)
      .then(data => setApts(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const aptsForDay = d => apts.filter(a => a.startISO?.slice(0, 10) === d);

  const STATUS_COLOR = {
    confirmed: '#e94560',
    completed: '#22c55e',
    cancelled: '#ef4444',
    no_show:   '#f59e0b'
  };

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setWeekStart(w => addDays(w, -7))} className="text-muted text-2xl px-2">‹</button>
        <div className="text-center">
          <p className="font-semibold text-sm">
            {new Date(weekStart + 'T12:00:00Z').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
            {' — '}
            {new Date(weekEnd + 'T12:00:00Z').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <button onClick={() => setWeekStart(getMondayOfWeek(today))} className="text-xs text-primary underline">
            השבוע הנוכחי
          </button>
        </div>
        <button onClick={() => setWeekStart(w => addDays(w, 7))} className="text-muted text-2xl px-2">›</button>
      </div>

      {/* Week summary */}
      {!loading && (
        <div className="card flex justify-around mb-4 py-3">
          <div className="text-center">
            <p className="text-xl font-bold text-primary">{apts.length}</p>
            <p className="text-xs text-muted">סה״כ תורים</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-success">
              ₪{apts.filter(a => a.status === 'completed').reduce((s, a) => s + (a.servicePrice || 0), 0)}
            </p>
            <p className="text-xs text-muted">הכנסה</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted py-10">טוען...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {days.map(d => {
            const dayApts = aptsForDay(d);
            const isToday = d === today;
            return (
              <button
                key={d}
                onClick={() => navigate('/admin/day', { state: { date: d } })}
                className={`card flex items-center justify-between gap-3 text-right transition-all active:scale-95 ${
                  isToday ? 'border border-primary' : 'border border-surface'
                }`}
              >
                <div>
                  <p className={`font-semibold ${isToday ? 'text-primary' : ''}`}>
                    {formatShort(d)}
                    {isToday && <span className="mr-2 text-xs badge-confirmed">היום</span>}
                  </p>
                  {dayApts.length === 0
                    ? <p className="text-xs text-muted">אין תורים</p>
                    : <p className="text-xs text-muted">{dayApts.length} תורים</p>
                  }
                </div>
                {dayApts.length > 0 && (
                  <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
                    {dayApts.map(a => (
                      <span key={a.id}
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: STATUS_COLOR[a.status] || '#8892a4' }}
                        title={a.customerName}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
