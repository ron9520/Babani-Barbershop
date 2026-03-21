import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminApi } from '../../hooks/useApi.js';
import { DateTime } from 'luxon';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
];

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function MonthCalendar() {
  const api = useAdminApi();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(DateTime.now());
  const [appointments, setAppointments] = useState({});
  const [loading, setLoading] = useState(false);

  // Load appointments for the current month
  useEffect(() => {
    const start = currentDate.startOf('month').toFormat('yyyy-MM-dd');
    const end = currentDate.endOf('month').toFormat('yyyy-MM-dd');

    setLoading(true);
    api.get(`/admin/appointments/range?from=${start}&to=${end}`)
      .then(apts => {
        // Group appointments by date
        const byDate = {};
        apts.forEach(apt => {
          const date = apt.startISO?.slice(0, 10);
          if (date) {
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(apt);
          }
        });
        setAppointments(byDate);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentDate]);

  const goToPreviousMonth = () => {
    setCurrentDate(currentDate.minus({ months: 1 }));
  };

  const goToNextMonth = () => {
    setCurrentDate(currentDate.plus({ months: 1 }));
  };

  const goToDay = (day) => {
    const dateStr = currentDate.set({ day }).toFormat('yyyy-MM-dd');
    navigate(`/admin/day?date=${dateStr}`);
  };

  // Build calendar grid
  const monthStart = currentDate.startOf('month');
  const monthEnd = currentDate.endOf('month');
  const startDate = monthStart.startOf('week');
  const endDate = monthEnd.endOf('week');

  const days = [];
  let current = startDate;
  while (current <= endDate) {
    days.push(current);
    current = current.plus({ days: 1 });
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const monthName = HEBREW_MONTHS[currentDate.month - 1];
  const year = currentDate.year;

  return (
    <div className="px-4 pt-4 max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPreviousMonth}
          className="text-2xl text-muted active:opacity-70"
        >
          ›
        </button>
        <h1 className="text-2xl font-bold">{monthName} {year}</h1>
        <button
          onClick={goToNextMonth}
          className="text-2xl text-muted active:opacity-70"
        >
          ‹
        </button>
      </div>

      {loading ? (
        <p className="text-center text-muted py-10">טוען...</p>
      ) : (
        <div className="card overflow-hidden">
          {/* Day names header */}
          <div className="grid grid-cols-7 gap-0 border-b border-surface">
            {HEBREW_DAYS.map((day, i) => (
              <div
                key={day}
                className="text-center py-2 bg-surface text-xs font-semibold text-muted"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-0 border-b border-surface last:border-0">
              {week.map((day, dayIdx) => {
                const dateStr = day.toFormat('yyyy-MM-dd');
                const isCurrentMonth = day.month === currentDate.month;
                const dayAppointments = appointments[dateStr] || [];
                const confirmedCount = dayAppointments.filter(a => a.status === 'confirmed').length;

                return (
                  <button
                    key={dayIdx}
                    onClick={() => goToDay(day.day)}
                    className={`
                      aspect-square p-2 text-center border-r border-surface last:border-r-0 flex flex-col items-center justify-center
                      transition-colors active:bg-primary/20
                      ${isCurrentMonth ? 'bg-bg' : 'bg-surface opacity-50'}
                      ${day.toFormat('yyyy-MM-dd') === DateTime.now().toFormat('yyyy-MM-dd') ? 'ring-2 ring-primary' : ''}
                    `}
                  >
                    <span className={`text-sm font-semibold ${isCurrentMonth ? 'text-text' : 'text-muted'}`}>
                      {day.day}
                    </span>
                    {confirmedCount > 0 && (
                      <span className="mt-1 inline-block px-2 py-0.5 bg-primary text-white text-xs rounded-full font-medium">
                        {confirmedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
