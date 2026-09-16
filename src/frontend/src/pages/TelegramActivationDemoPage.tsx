import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, KeyRound, LockKeyhole,
  MessageCircle, Phone, RefreshCw, Send, ShieldCheck,
} from 'lucide-react';

type Step = 'link' | 'telegram' | 'match' | 'success';
const steps: Step[] = ['link', 'telegram', 'match', 'success'];

function Progress({ step }: { step: Step }) {
  const active = steps.indexOf(step);
  return (
    <div className="activation-progress grid gap-1.5" aria-label={`Шаг ${active + 1} из 4`}>
      {steps.map((item, index) => (
        <div key={item} className={`h-1 rounded-full ${index <= active ? 'bg-[#D75B28]' : 'bg-[#DED8CE]'}`} />
      ))}
    </div>
  );
}

const PrimaryButton = ({ children, onClick, orange = false }: {
  children: React.ReactNode; onClick: () => void; orange?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-h-14 w-full items-center justify-center gap-3 rounded-[19px] px-5 font-semibold text-white transition-transform active:scale-[0.985] ${orange ? 'bg-[#D75B28]' : 'bg-[#24211D]'}`}
  >
    {children}
  </button>
);

export default function TelegramActivationDemoPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('link');
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState(false);
  const [matchError, setMatchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL('https://t.me/kamizobot?start=activate_demo_117', {
      width: 420, margin: 1, errorCorrectionLevel: 'H',
      color: { dark: '#24211D', light: '#FFFFFF' },
    }).then(url => { if (!cancelled) setQrUrl(url); })
      .catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, []);

  const back = () => {
    const index = steps.indexOf(step);
    if (index === 0) navigate('/login');
    else setStep(steps[index - 1]);
  };

  const chooseCode = (code: string) => {
    if (code !== '47') return setMatchError(true);
    setMatchError(false);
    setStep('success');
  };

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#F4F0E8] text-[#24211D]">
      <style>{`
        @keyframes activation-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .activation-progress { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
      `}</style>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] sm:px-8">
        <header className="mb-6">
          <div className="mb-6 flex items-center justify-between">
            <button type="button" onClick={back} className="grid h-11 w-11 place-items-center rounded-full border border-[#D8D0C4] bg-white/70 active:scale-[0.96]" aria-label="Назад">
              <ArrowLeft size={20} strokeWidth={1.9} />
            </button>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Первый вход</p>
              <p className="mt-0.5 text-sm font-semibold">My Helper</p>
            </div>
          </div>
          <Progress step={step} />
        </header>

        <section key={step} className="flex flex-1 flex-col [animation:activation-enter_.35s_cubic-bezier(.16,1,.3,1)_both]">
          {step === 'link' && (
            <>
              <div className="mb-7 max-w-[340px]">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-[18px] bg-[#D75B28] text-white"><ShieldCheck size={23} /></div>
                <h1 className="text-[34px] font-semibold leading-[1.02] tracking-[-0.045em]">Защитите первый вход</h1>
                <p className="mt-4 text-[15px] leading-6 text-[#6F675D]">Пароль принят. Теперь подключите личный Telegram, чтобы никто другой не смог активировать аккаунт.</p>
              </div>
              <div className="mb-5 rounded-[28px] border border-[#DDD5C9] bg-white p-5 shadow-[0_20px_55px_-38px_rgba(70,48,35,.45)]">
                <div className="mb-5 flex items-center justify-between border-b border-[#EEE9E2] pb-4">
                  <div><p className="text-xs text-[#8A8175]">Аккаунт</p><p className="mt-1 font-semibold">117 дом · квартира 48</p></div>
                  <span className="rounded-full bg-[#F6E6DC] px-3 py-1.5 text-xs font-semibold text-[#A6421B]">Активация</span>
                </div>
                <div className="mx-auto w-[216px] rounded-[24px] border border-[#E7E1D8] bg-white p-3">
                  {!qrUrl && !qrError && <div className="aspect-square animate-pulse rounded-[16px] bg-[#EEE9E2]" />}
                  {qrUrl && <img src={qrUrl} alt="QR-код подключения Telegram" className="aspect-square w-full rounded-[14px]" />}
                  {qrError && <div className="grid aspect-square place-items-center rounded-[16px] bg-[#F4F0E8] text-sm text-[#6F675D]">QR-код не загрузился</div>}
                </div>
                <div className="mt-5 flex gap-3 rounded-[18px] bg-[#F4F0E8] p-4">
                  <LockKeyhole className="mt-0.5 shrink-0 text-[#D75B28]" size={18} />
                  <p className="text-[13px] leading-5 text-[#6F675D]">Ссылка действует 10 минут и привязана только к этому аккаунту.</p>
                </div>
              </div>
              <div className="mt-auto">
                <PrimaryButton onClick={() => setStep('telegram')}><Send size={19} /> Открыть Telegram <ArrowRight size={19} className="ml-auto" /></PrimaryButton>
              </div>
            </>
          )}

          {step === 'telegram' && (
            <>
              <div className="mb-8 flex items-center gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-[18px] bg-[#24211D] text-white"><Send size={21} /></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A8175]">Личный чат</p><h1 className="mt-1 text-2xl font-semibold">Kamizo</h1></div>
              </div>
              <div className="ml-5 rounded-[26px_26px_8px_26px] bg-white p-5 shadow-[0_18px_45px_-34px_rgba(70,48,35,.5)]">
                <p className="text-[15px] font-semibold">Подключить Telegram к аккаунту?</p>
                <div className="my-4 border-l-2 border-[#D75B28] pl-4"><p className="font-semibold">My Helper</p><p className="mt-1 text-sm text-[#6F675D]">117 дом · квартира 48</p></div>
                <p className="text-sm leading-5 text-[#6F675D]">Для подтверждения отправьте номер, зарегистрированный в вашем Telegram.</p>
              </div>
              <div className="mt-auto space-y-3">
                <div className="flex items-center gap-3 rounded-[18px] border border-[#DDD5C9] bg-white/60 p-4 text-sm text-[#6F675D]"><Phone size={18} className="text-[#D75B28]" />Номер не будет показан в группе</div>
                <PrimaryButton orange onClick={() => setStep('match')}><Phone size={19} /> Поделиться моим номером</PrimaryButton>
              </div>
            </>
          )}

          {step === 'match' && (
            <>
              <div className="mb-7 max-w-[360px]">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-[18px] bg-[#24211D] text-white"><KeyRound size={22} /></div>
                <h1 className="text-[32px] font-semibold tracking-[-0.04em]">Подтвердите число</h1>
                <p className="mt-4 text-[15px] leading-6 text-[#6F675D]">Выберите число, которое сейчас показано на экране входа Kamizo.</p>
              </div>
              <div className="mb-6 rounded-[26px] border border-[#DDD5C9] bg-white p-5">
                <div className="flex items-center gap-3 border-b border-[#EEE9E2] pb-4">
                  <MessageCircle size={19} className="text-[#D75B28]" />
                  <div><p className="text-xs text-[#8A8175]">Telegram подтверждён</p><p className="mt-0.5 text-sm font-semibold">+998 •• ••• 42 18</p></div>
                  <Check className="ml-auto text-[#D75B28]" size={19} />
                </div>
                <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Код на экране</p>
                <p className="mt-2 text-center font-mono text-5xl font-semibold">47</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {['31', '47', '82'].map(code => (
                  <button key={code} type="button" onClick={() => chooseCode(code)} className="min-h-16 rounded-[18px] border border-[#D8D0C4] bg-white text-xl font-semibold active:scale-[0.96]">{code}</button>
                ))}
              </div>
              {matchError && <p role="alert" className="mt-4 rounded-[16px] bg-[#F6E6DC] px-4 py-3 text-center text-sm font-medium text-[#9D3D1A]">Число не совпало. Проверьте экран Kamizo.</p>}
            </>
          )}

          {step === 'success' && (
            <>
              <div className="flex flex-1 flex-col justify-center pb-10">
                <div className="mb-7 grid h-16 w-16 place-items-center rounded-[22px] bg-[#D75B28] text-white"><CheckCircle2 size={31} /></div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A8175]">Защита включена</p>
                <h1 className="mt-3 text-[38px] font-semibold leading-[1.02] tracking-[-0.05em]">Telegram подключён</h1>
                <p className="mt-5 text-[15px] leading-6 text-[#6F675D]">Новые устройства будут входить только после подтверждения в личном чате Kamizo.</p>
                <div className="mt-8 divide-y divide-[#E7E1D8] rounded-[24px] border border-[#DDD5C9] bg-white px-5">
                  <div className="flex items-center gap-4 py-4"><ShieldCheck size={20} className="text-[#D75B28]" /><div><p className="text-sm font-semibold">Двухэтапный вход</p><p className="text-xs text-[#8A8175]">Активен для новых устройств</p></div></div>
                  <div className="flex items-center gap-4 py-4"><KeyRound size={20} className="text-[#D75B28]" /><div><p className="text-sm font-semibold">Резервные коды</p><p className="text-xs text-[#8A8175]">8 кодов после смены пароля</p></div></div>
                </div>
              </div>
              <PrimaryButton onClick={() => setStep('link')}><RefreshCw size={18} /> Повторить демонстрацию</PrimaryButton>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
