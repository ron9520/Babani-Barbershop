import { useState, useEffect } from 'react';
import { useAdminApi } from '../../hooks/useApi.js';

export default function PriceList() {
  const api = useAdminApi();
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [addOpen, setAddOpen]   = useState(false);
  const [msg, setMsg]           = useState('');

  const load = () => {
    setLoading(true);
    api.get('/admin/services')
      .then(setServices)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (svc) => {
    await api.put(`/admin/services/${svc.id}`, { active: !svc.active });
    load();
  };

  const deleteService = async (id) => {
    if (!confirm('למחוק שירות זה?')) return;
    await api.del(`/admin/services/${id}`);
    load();
  };

  const flash = text => { setMsg(text); setTimeout(() => setMsg(''), 2000); };

  return (
    <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold">💈 מחירון שירותים</h1>
        <button onClick={() => setAddOpen(true)} className="btn-primary text-sm py-2 px-4">+ הוסף</button>
      </div>

      {msg && <p className="text-success text-sm mb-3">{msg}</p>}

      {loading ? (
        <p className="text-center text-muted py-10">טוען...</p>
      ) : (
        <div className="flex flex-col gap-3">
          {services.map(svc => (
            <div key={svc.id} className={`card border ${svc.active ? 'border-surface' : 'border-danger/30 opacity-60'}`}>
              {editId === svc.id
                ? <EditRow svc={svc} api={api} onDone={() => { setEditId(null); load(); flash('✅ נשמר'); }} onCancel={() => setEditId(null)} />
                : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="font-semibold">{svc.name}</p>
                      <p className="text-sm text-muted">₪{svc.price} · {svc.durationMinutes} דקות</p>
                    </div>
                    <button onClick={() => setEditId(svc.id)} className="text-muted text-sm px-2">✏️</button>
                    <button onClick={() => toggleActive(svc)} className="text-muted text-sm px-2" title={svc.active ? 'השבת' : 'הפעל'}>
                      {svc.active ? '👁' : '🙈'}
                    </button>
                    <button onClick={() => deleteService(svc.id)} className="text-danger text-sm px-2">🗑</button>
                  </div>
                )
              }
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddModal api={api} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load(); flash('✅ שירות נוסף'); }} />}
    </div>
  );
}

function EditRow({ svc, api, onDone, onCancel }) {
  const [form, setForm] = useState({ name: svc.name, price: svc.price, durationMinutes: svc.durationMinutes });
  const save = async () => {
    await api.put(`/admin/services/${svc.id}`, form);
    onDone();
  };
  return (
    <div className="flex flex-col gap-2">
      <input className="input text-sm py-2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם" />
      <div className="flex gap-2">
        <input className="input text-sm py-2 flex-1" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="מחיר" />
        <input className="input text-sm py-2 flex-1" type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} placeholder="דקות" />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 btn-ghost text-sm py-1.5">ביטול</button>
        <button onClick={save} className="flex-1 btn-primary text-sm py-1.5">שמור</button>
      </div>
    </div>
  );
}

function AddModal({ api, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', price: '', durationMinutes: '30', order: '0' });
  const submit = async e => {
    e.preventDefault();
    await api.post('/admin/services', form);
    onDone();
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div className="bg-card w-full rounded-t-3xl p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg mb-4">הוסף שירות חדש</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className="input" placeholder="שם השירות *" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" type="number" placeholder="מחיר ₪ *" required value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
          <input className="input" type="number" placeholder="משך בדקות *" required value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-ghost">ביטול</button>
            <button type="submit" className="flex-1 btn-primary">הוסף</button>
          </div>
        </form>
      </div>
    </div>
  );
}
