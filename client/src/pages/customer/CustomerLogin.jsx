import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const STEPS = { PHONE: 'phone', OTP: 'otp' };

export default function CustomerLogin() {
  const [step, setStep]     = useState(STEPS.PHONE);
  const [phone, setPhone]   = useState('');
  const [otp, setOtp]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const { loginCustomer }   = useAuth();
  const navigate            = useNavigate();

  const sendOtp = async e => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customer/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בשליחת קוד');
      setStep(STEPS.OTP);
      startCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customer/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'קוד שגוי');
      loginCustomer(data.token, data.phone);
      navigate('/my-appointments');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startCooldown = secs => {
    setResendCooldown(secs);
    const t = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(t); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Back button */}
      <div className="px-4 pt-safe pt-4">
        <button onClick={() => step === STEPS.OTP ? setStep(STEPS.PHONE) : navigate('/')} className="text-muted text-xl">‹</button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6">
        <div className="text-center mb-10">
          <span className="text-5xl">📱</span>
          <h1 className="text-2xl font-bold mt-3">התחברות</h1>
          <p className="text-muted text-sm mt-1">ראה את התורים שלך</p>
        </div>

        {step === STEPS.PHONE ? (
          <form onSubmit={sendOtp} className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">מספר WhatsApp שלך</label>
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
              {loading ? 'שולח...' : 'שלח קוד ב-WhatsApp'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="flex flex-col gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">קוד אימות</label>
              <p className="text-muted text-xs mb-3 text-center">שלחנו קוד 4 ספרות ל-{phone}</p>
              <input
                className="input text-center text-3xl tracking-[1rem] font-bold"
                type="tel" inputMode="numeric" maxLength={4} required
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
            {error && <p className="text-danger text-sm text-center">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading || otp.length !== 4}>
              {loading ? 'מאמת...' : 'כניסה'}
            </button>
            <button type="button" onClick={() => resendCooldown === 0 && sendOtp()}
              className="text-sm text-center text-muted" disabled={resendCooldown > 0}>
              {resendCooldown > 0 ? `שלח שוב בעוד ${resendCooldown}ש׳` : 'שלח קוד מחדש'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
