const STATUS_LABELS = {
  confirmed: 'מאושר',
  completed: 'הושלם',
  cancelled: 'בוטל',
  no_show:   'לא הגיע'
};

export default function AppointmentCard({ apt, actions, compact = false }) {
  const badgeClass = {
    confirmed: 'badge-confirmed',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
    no_show:   'badge-no_show'
  }[apt.status] || 'badge-confirmed';

  return (
    <div className={`card border border-surface animate-fadeIn ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-base truncate">{apt.customerName}</span>
            <span className={badgeClass}>{STATUS_LABELS[apt.status] || apt.status}</span>
          </div>
          <p className="text-muted text-sm mt-0.5">
            ✂️ {apt.serviceName}
            {apt.servicePrice ? ` · ₪${apt.servicePrice}` : ''}
          </p>
          <p className="text-muted text-sm">
            🕐 {apt.timeDisplay}
            {apt.dateDisplay ? ` · ${apt.dateDisplay}` : ''}
          </p>
          {apt.phone && !compact && (
            <p className="text-muted text-xs mt-1">📱 {apt.phone}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-col gap-1 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
