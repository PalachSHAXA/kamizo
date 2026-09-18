import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, LockKeyhole, Send, ShieldCheck, X } from 'lucide-react';
import { authApi } from '../../services/api/auth';
import { useAuthStore } from '../../stores/authStore';

export function TelegramActivationFlow() {
  const activation = useAuthStore(state => state.pendingActivation);
  const clear = useAuthStore(state => state.clearPendingActivation);
  const complete = useAuthStore(state => state.completeTelegramActivation);
  const finish = useAuthStore(state => state.finishTelegramActivation);
  const [status, setStatus] = useState<'pending' | 'awaiting_contact' | 'awaiting_match' | 'approved' | 'denied' | 'expired'>('pending');
  const [qrUrl, setQrUrl] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Awaited<ReturnType<typeof complete>>>(null);

  useEffect(() => {
    if (!activation) return;
    let cancelled = false;
    void import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(activation.telegramUrl, {
      width: 420, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: '#24211D', light: '#FFFFFF' },
    })).then(url => { if (!cancelled) setQrUrl(url); });
    return () => { cancelled = true; };
  }, [activation]);

  useEffect(() => {
    if (!activation || completed || status === 'approved' || status === 'denied' || status === 'expired') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await authApi.telegramActivationStatus(activation.requestId, activation.tenantId, activation.browserSecret);
        if (!cancelled && result.status !== 'consumed') setStatus(result.status);
      } catch { /* retry until activation TTL expires */ }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activation, completed, status]);

  if (!activation) return null;

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) return setError('Пароль должен содержать не менее 6 символов');
    if (password !== confirmPassword) return setError('Пароли не совпадают');
    setSubmitting(true);
    const result = await complete(password);
    setSubmitting(false);
    if (!result) return setError('Не удалось завершить активацию. Попробуйте ещё раз.');
    setCompleted(result);
  };

  const finishLogin = () => {
    if (completed) finish(completed.user, completed.token);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F4F0E8] text-[#24211D]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]">
        <header className="mb-7 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Первый вход</p>
            <p className="mt-1 text-sm font-semibold">Защита аккаунта</p>
          </div>
          {!completed && (
            <button type="button" onClick={clear} className="grid h-11 w-11 place-items-center rounded-full border border-[#D8D0C4] bg-white/70" aria-label="Отмена">
              <X size={20} />
            </button>
          )}
        </header>

        {!completed && status !== 'approved' && (
          <section className="flex flex-1 flex-col">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-[18px] bg-[#D75B28] text-white"><ShieldCheck size={23} /></div>
            <h1 className="text-[34px] font-semibold leading-[1.03] tracking-[-0.045em]">Подключите Telegram</h1>
            <p className="mt-4 text-[15px] leading-6 text-[#6F675D]">
              Пароль принят. Подтвердите номер и число в личном чате Kamizo — до этого доступ к аккаунту не выдаётся.
            </p>

            <div className="my-7 rounded-[28px] border border-[#DDD5C9] bg-white p-5">
              <div className="flex items-center justify-between border-b border-[#EEE9E2] pb-4">
                <div><p className="text-xs text-[#8A8175]">Аккаунт</p><p className="mt-1 font-semibold">{activation.account.name}</p></div>
                <span className="rounded-full bg-[#F6E6DC] px-3 py-1.5 text-xs font-semibold text-[#A6421B]">10 минут</span>
              </div>
              {status === 'awaiting_match' ? (
                <div className="py-10 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Число на экране</p>
                  <p className="mt-3 font-mono text-6xl font-semibold">{activation.challenge}</p>
                  <p className="mt-5 text-sm leading-5 text-[#6F675D]">Выберите это число в сообщении бота.</p>
                </div>
              ) : (
                <div className="mx-auto mt-5 w-[210px] rounded-[22px] border border-[#E7E1D8] p-3">
                  {qrUrl ? <img src={qrUrl} alt="QR-код активации Telegram" className="w-full rounded-[12px]" /> : <div className="aspect-square animate-pulse rounded-[12px] bg-[#EEE9E2]" />}
                </div>
              )}
              <div className="mt-5 flex gap-3 rounded-[18px] bg-[#F4F0E8] p-4">
                <LockKeyhole className="mt-0.5 shrink-0 text-[#D75B28]" size={18} />
                <p className="text-[13px] leading-5 text-[#6F675D]">
                  {status === 'awaiting_contact' ? `Отправьте Telegram-контакт. Ожидаемый номер: ${activation.account.phone || 'уточните у администратора'}` : 'Ссылка одноразовая и привязана только к этой попытке входа.'}
                </p>
              </div>
            </div>

            {(status === 'denied' || status === 'expired') ? (
              <div className="mt-auto rounded-[18px] bg-[#F6E6DC] p-4 text-sm text-[#9D3D1A]">
                Активация завершена или срок ссылки истёк. Вернитесь к форме входа и начните заново.
              </div>
            ) : (
              <button type="button" onClick={() => window.open(activation.telegramUrl, '_blank')} className="mt-auto flex min-h-14 items-center justify-center gap-3 rounded-[19px] bg-[#24211D] px-5 font-semibold text-white active:scale-[0.985]">
                <Send size={19} /> Открыть Telegram
              </button>
            )}
          </section>
        )}

        {!completed && status === 'approved' && (
          <form onSubmit={submitPassword} className="flex flex-1 flex-col">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-[18px] bg-[#D75B28] text-white"><KeyRound size={22} /></div>
            <h1 className="text-[34px] font-semibold tracking-[-0.045em]">Задайте новый пароль</h1>
            <p className="mt-4 text-[15px] leading-6 text-[#6F675D]">Telegram и номер подтверждены. Временный пароль больше нельзя будет использовать.</p>
            <div className="mt-8 space-y-4">
              <label className="block"><span className="mb-2 block text-sm font-semibold">Новый пароль</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} className="min-h-14 w-full rounded-[17px] border border-[#D8D0C4] bg-white px-4 outline-none focus:border-[#D75B28]" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Повторите пароль</span><input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="min-h-14 w-full rounded-[17px] border border-[#D8D0C4] bg-white px-4 outline-none focus:border-[#D75B28]" /></label>
              {error && <p role="alert" className="rounded-[15px] bg-[#F6E6DC] px-4 py-3 text-sm text-[#9D3D1A]">{error}</p>}
            </div>
            <button disabled={submitting} className="mt-auto min-h-14 rounded-[19px] bg-[#D75B28] px-5 font-semibold text-white disabled:opacity-60">{submitting ? 'Сохраняем…' : 'Завершить активацию'}</button>
          </form>
        )}

        {completed && (
          <section className="flex flex-1 flex-col">
            <div className="mb-6 grid h-16 w-16 place-items-center rounded-[22px] bg-[#D75B28] text-white"><CheckCircle2 size={31} /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Защита включена</p>
            <h1 className="mt-3 text-[36px] font-semibold leading-[1.03] tracking-[-0.05em]">Сохраните резервные коды</h1>
            <p className="mt-4 text-[15px] leading-6 text-[#6F675D]">Каждый код работает один раз. После закрытия этого экрана показать их снова будет нельзя.</p>
            <div className="mt-7 grid grid-cols-2 gap-2 rounded-[24px] border border-[#DDD5C9] bg-white p-5">
              {completed.recoveryCodes.map(code => <code key={code} className="rounded-xl bg-[#F4F0E8] px-3 py-2 text-center text-sm font-semibold">{code}</code>)}
            </div>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(completed.recoveryCodes.join('\n'))} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-[16px] border border-[#D8D0C4] bg-white font-semibold"><Copy size={17} /> Копировать коды</button>
            <button type="button" onClick={finishLogin} className="mt-auto min-h-14 rounded-[19px] bg-[#24211D] px-5 font-semibold text-white">Я сохранил коды</button>
          </section>
        )}
      </div>
    </div>
  );
}
