import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import AppointmentCard from '../../components/AppointmentCard.jsx';

function StarRating({ onRate }) {
  const [hoveredRating, setHoveredRating] = useState(0);

  return (
    <div className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map(rating => (
        <button
          key={rating}
          onClick={() => onRate(rating)}
          onMouseEnter={() => setHoveredRating(rating)}
          onMouseLeave={() => setHoveredRating(0)}
          className="text-2xl transition-colors cursor-pointer"
          style={{
            color: rating <= (hoveredRating || 0) ? '#facc15' : '#d1d5db'
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function MyAppointments() {
  const api      = useCustomerApi();
  const { logoutCustomer, customerPhone } = useAuth();
  const navigate = useNavigate();
  const [apts, setApts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]       = useState('');
  const [ratingId, setRatingId] = useState(null);

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

  const rate = async (id, rating) => {
    try {
      await api.post(`/customer/appointments/${id}/rate`, { rating });
      flash('תודה על הדירוג! ⭐');
      setRatingId(null);
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
        ) : apts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-5xl mb-4">✂️</p>
            <p className="font-semibold text-lg mb-1">לא נמצאו תורים</p>
            <p className="text-muted text-sm mb-6">עדיין לא קבעת תור במספרת בבאני</p>
            <button onClick={() => navigate('/')} className="btn-primary px-8">
              קבע תור עכשיו
            </button>
          </div>
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
                    <div key={apt.id}>
                      <AppointmentCard
                        apt={{ ...apt, dateDisplay: apt.dateDisplay || apt.startISO?.slice(0,10) }}
                        compact
                      />
                      {apt.status === 'completed' && !apt.rating && (
                        <div className="mt-2 p-3 bg-surface rounded-xl">
                          <p className="text-xs text-muted mb-2">דרג את התור</p>
                          <StarRating
                            onRate={(rating) => rate(apt.id, rating)}
                          />
                        </div>
                      )}
                      {apt.status === 'completed' && apt.rating && (
                        <div className="mt-2 p-3 bg-success/10 rounded-xl text-center">
                          <p className="text-sm text-success font-semibold">תודה על הדירוג! ⭐</p>
                          <div className="mt-1">
                            {[...Array(5)].map((_, i) => (
                              <span key={i} className={i < apt.rating ? 'text-yellow-400' : 'text-gray-400'}>★</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
