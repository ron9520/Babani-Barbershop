import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function CustomerGuard() {
  const { isCustomer } = useAuth();
  if (!isCustomer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
