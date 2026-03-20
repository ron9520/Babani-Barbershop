import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AdminNav from './AdminNav.jsx';

export default function AdminGuard() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="flex-1 overflow-auto" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </div>
      <AdminNav />
    </div>
  );
}
