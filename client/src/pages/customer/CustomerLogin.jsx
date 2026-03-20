import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function CustomerLogin() {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const { loginCustomer }     = useAuth();
  const navigate              = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customer/phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בכניסה');
      loginCustomer(data.token, data.phone);
      navigate('/my-appointments');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="px-4 pt-safe pt-4">
        <button onClick={() => navigate('/')} className="text-muted text-xl">‹</button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center mb-10">
          <span className="text-5xl">📱</span>
          <h1 className="text-2xl font-bold mt-3">התורים שלי</h1>
          <p className="text-muted text-sm mt-1">הכנס את מספר הטלפון שקבעת איתו תור</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm text-muted mb-1 block">מספר טלפון</label>
            <input
              className="input text-center text-lg tracking-wider" dir="ltr"
              type="tel" placeholder="972501234567" required
              value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
              autoFocus
            />
            <p className="text-xs text-muted mt-1 text-center">כולל קידומת מדינה (972 לישראל)</p>
          </div>
          {error && <p className="text-danger text-sm text-center">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading || phone.length < 10}>
            {loading ? 'טוען...' : 'הצג תורים שלי'}
          </button>
        </form>
      </div>
    </div>
  );
}
