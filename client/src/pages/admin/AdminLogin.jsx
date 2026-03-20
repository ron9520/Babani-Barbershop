import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminLogin() {
  const [pin, setPin]       = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin }      = useAuth();
  const navigate            = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN שגוי');
      loginAdmin(data.token);
      navigate('/admin/day');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <span className="text-5xl">💈</span>
          <h1 className="text-2xl font-bold mt-3">מספרת בבאני</h1>
          <p className="text-muted text-sm mt-1">פאנל ניהול</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-muted mb-1 block">קוד PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="הכנס PIN"
              className="input text-center text-2xl tracking-widest"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-danger text-sm text-center">{error}</p>
          )}

          <button type="submit" className="btn-primary" disabled={pin.length < 4 || loading}>
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  );
}
