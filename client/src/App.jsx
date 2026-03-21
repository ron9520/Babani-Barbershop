import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';

// Admin pages
import AdminLogin    from './pages/admin/AdminLogin.jsx';
import DayView       from './pages/admin/DayView.jsx';
import WeekView      from './pages/admin/WeekView.jsx';
import MonthCalendar from './pages/admin/MonthCalendar.jsx';
import Stats         from './pages/admin/Stats.jsx';
import Settings      from './pages/admin/Settings.jsx';
import PriceList     from './pages/admin/PriceList.jsx';
import Customers     from './pages/admin/Customers.jsx';

// Customer pages
import Landing       from './pages/customer/Landing.jsx';
import CustomerLogin from './pages/customer/CustomerLogin.jsx';
import MyAppointments from './pages/customer/MyAppointments.jsx';

// Guards
import AdminGuard    from './components/AdminGuard.jsx';
import CustomerGuard from './components/CustomerGuard.jsx';
import InstallBanner from './components/InstallBanner.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <InstallBanner />
        <Routes>
          {/* ── Public customer routes ── */}
          <Route path="/"              element={<Landing />} />
          <Route path="/login"         element={<CustomerLogin />} />

          {/* ── Protected customer routes ── */}
          <Route element={<CustomerGuard />}>
            <Route path="/my-appointments" element={<MyAppointments />} />
          </Route>

          {/* ── Admin routes ── */}
          <Route path="/admin/login"   element={<AdminLogin />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin"         element={<Navigate to="/admin/day" replace />} />
            <Route path="/admin/day"     element={<DayView />} />
            <Route path="/admin/week"    element={<WeekView />} />
            <Route path="/admin/calendar" element={<MonthCalendar />} />
            <Route path="/admin/stats"   element={<Stats />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/prices"  element={<PriceList />} />
            <Route path="/admin/customers" element={<Customers />} />
          </Route>

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
