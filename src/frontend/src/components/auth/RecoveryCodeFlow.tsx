import { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { authApi } from '../../services/api/auth';
import { useAuthStore } from '../../stores/authStore';

export function RecoveryCodeFlow({ tenantSlug, onClose }: { tenantSlug: string; onClose: () => void }) {
  const finish = useAuthStore(state => state.finishTelegramActivation);
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.recoverWithCode(login.trim(), tenantSlug, code.trim().toUpperCase(), password);
      finish(result.user, result.token);
    } catch {
      setError('Не удалось использовать код. Проверьте данные и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F4F0E8] px-5 py-[max(20px,env(safe-area-inset-top))] text-[#24211D]">
      <div className="mx-auto flex min-h-[calc(100dvh-40px)] w-full max-w-sm flex-col">
        <div className="flex justify-end"><button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-[#D8D0C4] bg-white"><X size={20} /></button></div>
        <div className="mt-10 grid h-14 w-14 place-items-center rounded-[20px] bg-[#D75B28] text-white"><KeyRound size={25} /></div>
        <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em]">Резервный код</h1>
        <p className="mt-3 text-sm leading-6 text-[#6F675D]">Используйте один из сохранённых кодов, чтобы отозвать потерянный Telegram и задать новый пароль.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-semibold">Логин</span><input value={login} onChange={event => setLogin(event.target.value)} className="min-h-14 w-full rounded-[17px] border border-[#D8D0C4] bg-white px-4 outline-none focus:border-[#D75B28]" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Код</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase().slice(0, 9))} placeholder="ABCD-EFGH" autoCapitalize="characters" className="min-h-14 w-full rounded-[17px] border border-[#D8D0C4] bg-white px-4 font-mono uppercase outline-none focus:border-[#D75B28]" /></label>
          <label className="block"><span className="mb-2 block text-sm font-semibold">Новый пароль</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} className="min-h-14 w-full rounded-[17px] border border-[#D8D0C4] bg-white px-4 outline-none focus:border-[#D75B28]" /></label>
          {error && <p className="rounded-[15px] bg-[#F6E6DC] px-4 py-3 text-sm text-[#9D3D1A]">{error}</p>}
          <button disabled={loading} className="min-h-14 w-full rounded-[19px] bg-[#24211D] font-semibold text-white disabled:opacity-60">{loading ? 'Проверяем…' : 'Восстановить доступ'}</button>
        </form>
      </div>
    </div>
  );
}
