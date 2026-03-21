import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCustomerPush } from '../hooks/usePushNotifications.js';

export default function CustomerGuard() {
  const { isCustomer, customerToken } = useAuth();
  useCustomerPush(customerToken);
  if (!isCustomer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
