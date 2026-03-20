import { useState, useEffect } from 'react';
import { useAdminApi } from '../../hooks/useApi.js';

const PERIODS = [
  { key: 'today', label: 'היום' },
  { key: 'week',  label: 'השבוע' },
  { key: 'month', label: 'החודש' }
];

export default function Stats() {
  const api = useAdminApi();
  const [period, setPeriod] = useState('week');
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/stats?period=${period}`)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [period]);

  const exportCSV = async () => {
    const res = await fetch(`/api/admin/export/csv?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
    });
    if (!res.ok) return alert('שגיאה בייצוא');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `timetable-${period}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">📊 סטטיסטיקות</h1>
        <button onClick={exportCSV} className="text-xs btn-ghost py-1.5 px-3">
          ⬇️ CSV
        </button>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-5">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              period === p.key ? 'bg-primary text-white' : 'bg-card text-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-muted py-10">טוען...</p>
      ) : !stats ? null : (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="✂️" label="תורים" value={stats.total} color="text-primary" />
            <StatCard icon="✅" label="הושלמו" value={stats.completed} color="text-success" />
            <StatCard icon="❌" label="בוטלו" value={stats.cancelled} color="text-danger" />
            <StatCard icon="👻" label="לא הגיעו" value={stats.noShow} color="text-warning" />
          </div>

          {/* Revenue */}
          <div className="card">
            <p className="text-muted text-xs mb-1">הכנסות</p>
            <p className="text-3xl font-bold text-success">₪{stats.totalRevenue}</p>
            <p className="text-muted text-xs mt-1">צפוי (כולל מאושרים): ₪{stats.expectedRevenue}</p>
          </div>

          {/* Popular services */}
          {stats.popularServices?.length > 0 && (
            <div className="card">
              <p className="font-semibold mb-3">💈 שירותים פופולריים</p>
              {stats.popularServices.slice(0, 5).map((s, i) => (
                <div key={s.name} className="flex justify-between items-center py-1.5 border-b border-surface last:border-0">
                  <span className="text-sm">{i + 1}. {s.name}</span>
                  <span className="text-sm text-primary font-semibold">{s.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Peak hours */}
          {stats.peakHours?.length > 0 && (
            <div className="card">
              <p className="font-semibold mb-3">🕐 שעות שיא</p>
              {stats.peakHours.map(h => (
                <div key={h.hour} className="flex justify-between items-center py-1.5 border-b border-surface last:border-0">
                  <span className="text-sm">{h.hour}</span>
                  <span className="text-sm text-primary font-semibold">{h.count} תורים</span>
                </div>
              ))}
            </div>
          )}

          {/* Daily revenue chart (simple bar) */}
          {stats.dailyRevenue?.length > 1 && (
            <div className="card">
              <p className="font-semibold mb-3">📈 הכנסה יומית</p>
              <MiniBarChart data={stats.dailyRevenue} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="card text-center">
      <p className="text-2xl">{icon}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function MiniBarChart({ data }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
          <div
            className="w-full bg-primary rounded-t"
            style={{ height: `${(d.revenue / max) * 64}px`, minHeight: d.revenue > 0 ? '4px' : '0' }}
          />
          <span className="text-[9px] text-muted">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}
