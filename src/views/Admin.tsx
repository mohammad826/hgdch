import React, { useState, useEffect } from 'react';
import { Shield, Settings, Key, User, CheckCircle2, XCircle } from 'lucide-react';
import { Withdrawal } from '../types';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  
  const [exchangeRate, setExchangeRate] = useState(10000);
  const [minWithdraw, setMinWithdraw] = useState(50000);
  const [dollarRate, setDollarRate] = useState(5.0);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setExchangeRate(data.settings.exchangeRate || 10000);
        setMinWithdraw(data.settings.minWithdraw || 50000);
        setDollarRate(data.settings.dollarRate || 5.0);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, settings: { exchangeRate, minWithdraw, dollarRate } })
      });
      const data = await res.json();
      if (data.success) {
        alert("تنظیمات با موفقیت ذخیره شد.");
      } else {
        alert(data.error || "خطا در ذخیره تنظیمات");
      }
    } catch (err) {
      console.error(err);
      alert("خطا در ارتباط با سرور");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      // Very basic local auth for demo, since firebase admin lacks auth provider here
      // Replace with real firebase auth if deploying for production
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        localStorage.setItem('admin_token', data.token);
      } else {
        setError(data.error || 'رمز ورود نامعتبر است.');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    if (!token) return;
    setLoadingData(true);
    try {
      const res = await fetch(`/api/admin/withdrawals?token=${token}`);
      const data = await res.json();
      if (res.status === 401) {
         setToken(null);
         localStorage.removeItem('admin_token');
         return;
      }
      if (data.success) {
        setWithdrawals(data.withdrawals.sort((a: Withdrawal, b: Withdrawal) => b.timestamp - a.timestamp));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSettings();
      fetchWithdrawals();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected', amount?: number, userId?: string) => {
    try {
      const res = await fetch('/api/admin/withdraw/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id, status })
      });
      const data = await res.json();
      if (data.success) {
        fetchWithdrawals();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert("خطا در به روزرسانی");
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/admin/logout', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ token })
        });
      } catch (err) {}
    }
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  if (!token) {
    return (
      <div className="flex flex-col p-6 items-center justify-center h-full w-full">
        <div className="w-full max-w-xs backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-6 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-2">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white text-center">ورود مدیریت</h2>
          
          <div className="w-full space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <Key className="w-4 h-4 text-white/40" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور..."
                className="w-full bg-black/30 border border-white/10 rounded-xl pr-10 pl-4 py-3 text-white placeholder-white/20 outline-none focus:border-red-500 transition-all font-mono text-left"
                dir="ltr"
              />
            </div>
            
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-sm text-white shadow-lg shadow-red-500/20 transition-all"
            >
              {loading ? 'در حال بررسی...' : 'ورود'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-400" />
          <h2 className="text-xl font-bold text-white">پنل ادمین</h2>
        </div>
        <button 
          onClick={handleLogout}
          className="px-4 py-2 bg-white/10 rounded-lg text-xs text-white hover:bg-white/20 transition-all flex items-center gap-2"
        >
          <XCircle className="w-4 h-4" />
          خروج
        </button>
      </div>

      <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-5 h-5 text-white/50" />
          <h3 className="text-white font-bold">تنظیمات اصلی کیف پول</h3>
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/50">نرخ تبدیل سکه به TON (هر چند سکه = 1 TON)</label>
          <input 
            type="number"
            value={exchangeRate}
            onChange={e => setExchangeRate(parseInt(e.target.value) || 10000)}
            className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
            dir="ltr"
          />
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/50">ارزش هر TON به دلار ($)</label>
          <input 
            type="number"
            step="0.1"
            value={dollarRate}
            onChange={e => setDollarRate(parseFloat(e.target.value) || 5.0)}
            className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
            dir="ltr"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-white/50">حداقل سکه برای برداشت</label>
          <input 
            type="number"
            value={minWithdraw}
            onChange={e => setMinWithdraw(parseInt(e.target.value) || 50000)}
            className="bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-red-500 font-mono"
            dir="ltr"
          />
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="w-full py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/40 rounded-xl font-bold text-sm transition-all mt-2"
        >
          {savingSettings ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-white/50" />
        <h3 className="text-white font-bold">درخواست های برداشت</h3>
      </div>

      {loadingData ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-white/20 border-t-red-400 rounded-full animate-spin" />
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="text-center text-white/40 border border-white/10 border-dashed rounded-xl py-10">
          درخواستی وجود ندارد.
        </div>
      ) : (
        <div className="space-y-4 pb-20">
          {withdrawals.map(w => (
            <div key={w.id} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div className="flex flex-col">
                  <span className="text-yellow-400 font-bold text-lg">{w.amount.toLocaleString()} سکه</span>
                  <span className="text-xs text-white/40 mt-1">{new Date(w.timestamp).toLocaleString('fa-IR')}</span>
                </div>
                <div>
                   {w.status === 'pending' ? (
                     <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-[10px] rounded border border-yellow-500/30">در حال بررسی</span>
                   ) : w.status === 'approved' ? (
                     <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] rounded border border-emerald-500/30">واریز شده</span>
                   ) : (
                     <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] rounded border border-red-500/30">رد شده</span>
                   )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-xs text-white/60">
                <User className="w-4 h-4" />
                <span className="font-mono text-[10px]">{w.userId}</span>
              </div>
              
              <div className="flex flex-col gap-1 bg-black/20 p-2 rounded-lg border border-white/5">
                <span className="text-[10px] text-white/40">آدرس {w.method}</span>
                <span className="font-mono text-xs text-cyan-400 break-all select-all">{w.address}</span>
              </div>

              {w.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button 
                    onClick={() => handleUpdateStatus(w.id, 'approved', w.amount, w.userId)}
                    className="flex-1 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-xl text-xs font-bold transition-all border border-emerald-500/30 flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> تایید و واریز
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(w.id, 'rejected', w.amount, w.userId)}
                    className="flex-1 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-xl text-xs font-bold transition-all border border-red-500/30 flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-4 h-4" /> رد کردن
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
