import { useAuth } from '../context/AuthContext.jsx';

export function useAdminApi() {
  const { adminToken, logoutAdmin } = useAuth();

  const request = async (method, path, body) => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (res.status === 401) {
      logoutAdmin();
      window.location.href = '/admin/login';
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    put:    (path, body)  => request('PUT',    path, body),
    patch:  (path, body)  => request('PATCH',  path, body),
    del:    (path)        => request('DELETE', path)
  };
}

export function useCustomerApi() {
  const { customerToken, logoutCustomer } = useAuth();

  const request = async (method, path, body) => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(customerToken ? { Authorization: `Bearer ${customerToken}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    if (res.status === 401) {
      logoutCustomer();
      window.location.href = '/login';
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  return {
    get:   (path)       => request('GET',    path),
    post:  (path, body) => request('POST',   path, body),
    del:   (path)       => request('DELETE', path)
  };
}
