import { useState, useEffect } from 'react';

export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    if (isStandalone) return;
    if (localStorage.getItem('installDismissed')) return;

    // Android / Chrome — capture beforeinstallprompt
    const handler = e => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS — show manual instruction after 3s
    if (isIos) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', handler); };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem('installDismissed', '1');
    setShow(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShow(false);
      setDeferredPrompt(null);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 inset-x-4 z-50 bg-card border border-primary rounded-2xl p-4 shadow-2xl animate-fadeIn">
      <div className="flex items-start gap-3">
        <span className="text-3xl">💈</span>
        <div className="flex-1">
          <p className="font-bold text-sm">הוסף לסן הבית</p>
          {isIos ? (
            <p className="text-xs text-muted mt-1">
              לחץ על כפתור השיתוף <span className="text-primary">⎙</span> ואז "הוסף למסך הבית"
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">קבל גישה מהירה + התראות פוש</p>
          )}
        </div>
        <button onClick={dismiss} className="text-muted text-lg leading-none">✕</button>
      </div>
      {!isIos && deferredPrompt && (
        <button onClick={install} className="mt-3 w-full btn-primary text-sm py-2">
          התקן עכשיו
        </button>
      )}
    </div>
  );
}
