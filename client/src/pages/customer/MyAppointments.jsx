import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import AppointmentCard from '../../components/AppointmentCard.jsx';

export default function MyAppointments() {
  const api      = useCustomerApi();
  const { logoutCustomer, customerPhone } = useAuth();
  const navigate = useNavigate();
  const [apts, setApts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]       = useState('');

  const load = () => {
    setLoading(true);
    api.get('/customer/appointments')
      .then(data => setApts(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!confirm('לבטל את התור?')) return;
    try {
      await api.del(`/customer/appointments/${id}`);
      flash('✅ התור בוטל');
      load();
    } catch (err) {
      flash('❌ ' + err.message);
    }
  };

  const flash = text => { setMsg(text); setTimeout(() => setMsg(''), 3000); };

  const upcoming = apts.filter(a => a.status === 'confirmed');
  const past     = apts.filter(a => a.status !== 'confirmed');

  const canCancel = apt => {
    // Check if more than 3 hours away
    if (!apt.startISO) return false;
    const diff = new Date(apt.startISO) - new Date();
    return diff > 3 * 60 * 60 * 1000;
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-2">
        <button onClick={() => navigate('/')} className="text-muted text-xl">‹</button>
        <h1 className="font-bold">התורים שלי</h1>
        <button
          onClick={() => { logoutCustomer(); navigate('/'); }}
          className="text-muted text-xs"
        >
          יציאה
        </button>
      </div>

      <div className="flex-1 px-4 pb-8 overflow-auto">
        {msg && <p className="text-sm text-center py-2 animate-fadeIn">{msg}</p>}

        {loading ? (
          <p className="text-center text-muted py-10">טוען...</p>
        ) : (
          <>
            {/* Upcoming */}
            <section className="mb-6">
              <h2 className="font-semibold text-muted text-sm mb-3 mt-2">📅 תורים קרובים</h2>
              {upcoming.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="text-3xl mb-2">🗓</p>
                  <p className="text-muted text-sm">אין תורים קרובים</p>
                  <button onClick={() => navigate('/')} className="btn-primary mt-4 text-sm py-2 px-6">
                    קבע תור עכשיו
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {upcoming.map(apt => (
                    <AppointmentCard
                      key={apt.id}
                      apt={{ ...apt, dateDisplay: apt.dateDisplay || apt.startISO?.slice(0,10) }}
                      actions={
                        canCancel(apt) ? (
                          <button
                            onClick={() => cancel(apt.id)}
                            className="text-danger text-xs border border-danger/40 rounded-lg px-2 py-1 active:opacity-70"
                          >
                            ❌ בטל
                          </button>
                        ) : (
                          <span className="text-muted text-xs">בעוד פחות מ-3 שעות</span>
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {/* History */}
            {past.length > 0 && (
              <section>
                <h2 className="font-semibold text-muted text-sm mb-3">🕐 היסטוריה</h2>
                <div className="flex flex-col gap-3">
                  {past.map(apt => (
                    <AppointmentCard
                      key={apt.id}
                      apt={{ ...apt, dateDisplay: apt.dateDisplay || apt.startISO?.slice(0,10) }}
                      compact
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
