'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../AdminUI';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); router.push('/admin'); }
    catch { setError('密码错误，请重试。'); } finally { setBusy(false); }
  }
  return (
    <main className="min-h-screen flex items-center justify-center bg-clinical-bg px-4">
      <form onSubmit={submit} className="clinical-card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-clinical-primary">案例审核台 · 登录</h1>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="管理密码" autoFocus className="w-full h-12 px-3 rounded border text-base" />
        {error && <p className="text-sm text-clinical-danger">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full h-12 rounded bg-clinical-primary text-white font-medium disabled:opacity-60">
          {busy ? '验证中…' : '进入'}
        </button>
      </form>
    </main>
  );
}
