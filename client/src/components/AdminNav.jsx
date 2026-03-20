import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/admin/day',       icon: '📅', label: 'יום' },
  { to: '/admin/week',      icon: '🗓',  label: 'שבוע' },
  { to: '/admin/stats',     icon: '📊', label: 'סטטס' },
  { to: '/admin/prices',    icon: '💈', label: 'מחירון' },
  { to: '/admin/settings',  icon: '⚙️', label: 'הגדרות' },
];

export default function AdminNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-surface flex z-50"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs transition-colors ${
              isActive ? 'text-primary' : 'text-muted'
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
