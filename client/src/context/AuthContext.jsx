import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminToken, setAdminToken]       = useState(() => localStorage.getItem('adminToken'));
  const [customerToken, setCustomerToken] = useState(() => localStorage.getItem('customerToken'));
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem('customerPhone'));

  const loginAdmin = (token) => {
    localStorage.setItem('adminToken', token);
    setAdminToken(token);
  };

  const logoutAdmin = () => {
    localStorage.removeItem('adminToken');
    setAdminToken(null);
  };

  const loginCustomer = (token, phone) => {
    localStorage.setItem('customerToken', token);
    localStorage.setItem('customerPhone', phone);
    setCustomerToken(token);
    setCustomerPhone(phone);
  };

  const logoutCustomer = () => {
    localStorage.removeItem('customerToken');
    localStorage.removeItem('customerPhone');
    setCustomerToken(null);
    setCustomerPhone(null);
  };

  return (
    <AuthContext.Provider value={{
      adminToken,
      customerToken,
      customerPhone,
      isAdmin: !!adminToken,
      isCustomer: !!customerToken,
      loginAdmin,
      logoutAdmin,
      loginCustomer,
      logoutCustomer
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
