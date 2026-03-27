import { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import type { User } from '../types';
import { generateQRCode } from './LazyQRCode';

interface ContractPreviewProps {
  user: User;
  qrCodeUrl?: string;
  language: 'ru' | 'uz';
}

// UK company details for QR code
const UK_QR_DATA = `ООО "KAMIZO"
ИНН: 307928888
МФО: 01071
Р/С: 20208000805307918001
Банк: Ориент Финанс ЧАКБ
Адрес: г. Ташкент, Яшнобадский р-н, ул. Махтумкули, 93/3`;

export function ContractPreview({ user, qrCodeUrl, language }: ContractPreviewProps) {
  const [ukQrCodeUrl, setUkQrCodeUrl] = useState<string>('');

  // Generate UK company QR code
  useEffect(() => {
    const generateUkQR = async () => {
      const url = await generateQRCode(UK_QR_DATA, {
        width: 200,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#1f2937', light: '#ffffff' },
      });
      setUkQrCodeUrl(url);
    };
    generateUkQR();
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="max-h-[80dvh] overflow-y-auto p-4 md:p-6 text-[11px] leading-relaxed text-gray-800">
        {/* Contract Title */}
        <div className="text-center mb-4">
          <h3 className="text-sm font-bold text-gray-900">ДОГОВОР УПРАВЛЕНИЯ</h3>
          <p className="text-sm font-bold text-gray-900">МНОГОКВАРТИРНЫМ ДОМОМ</p>
          <p className="text-xs text-gray-600 mt-2">
            «{formatDate(user.contractSignedAt || user.createdAt)}» г. Ташкент
          </p>
        </div>

        {/* Preamble */}
        <p className="mb-3 text-justify">
          Собственник жилого помещения <strong>{user.name}</strong> (общая площадь <em>{user.totalArea || '___'} кв.м.</em>),
          проживающий(ая) по адресу: <em>{user.address}{user.apartment ? `, кв. ${user.apartment}` : ''}</em> (далее - Собственник)
          и <strong>УК "KAMIZO"</strong> в лице директора DJULIYEV JAXONGIR XABIBULLAYEVICH, действующей на основании Устава,
          именуемый в дальнейшем Управляющая компания, заключили настоящий договор управления (нежилых) жилых помещений
          многоквартирном доме о нижеследующем:
        </p>

        {/* Section 1 */}
        <h4 className="font-bold text-center my-3">1. ОБЩИЕ ПОЛОЖЕНИЯ</h4>
        <p className="mb-2 text-justify">
          1.1. Настоящий договор заключен на основании ПРОТОКОЛА Собрания собственников жилых помещений в многоквартирном
          доме №{user.apartment || '___'} от «{formatDate(user.contractSignedAt || user.createdAt)}».
        </p>
        <p className="mb-2 text-justify">
          1.2. При выполнении условий настоящего Договора, Стороны руководствуются Конституцией РУз, Гражданским и Жилищным
          кодексом РУз, Законом Республики Узбекистан "Об управлении многоквартирными домами", Положением о порядке использования
          нежилых помещений в многоквартирных домах (Приложение №2 к Постановлению КМ РУз от 24.01.2000г №22), Постановления
          Кабинета Министров РУз. №5 от 04.01.2019г. «О дополнительных мерах по совершенствованию управления жилищно-коммунальной
          инфраструктурой г. Ташкента», иными положениями действующего законодательства и условиями настоящего договора.
        </p>

        {/* Section 2 */}
        <h4 className="font-bold text-center my-3">2. ПРЕДМЕТ ДОГОВОРА</h4>
        <p className="mb-2 text-justify">
          2.1. Цель настоящего Договора - обеспечение благоприятных и безопасных условий проживания граждан, сохранение и
          улучшение технического состояния общего имущества.
        </p>
        <p className="mb-2 text-justify">
          2.2. Управляющая компания обязуется оказывать услуги и выполнять работы по надлежащему управлению, содержанию и
          ремонту общего имущества в Многоквартирном доме, осуществлять иную направленную на достижение целей управления
          Многоквартирным домом деятельность. Вопросы оказания дополнительных услуг регулируются отдельным договором.
        </p>
        <p className="mb-2 text-justify">
          2.3. Границей эксплуатационной ответственности между общедомовым оборудованием и квартирой является: на системах
          горячего и холодного водоснабжения - отсекающая арматура (первый вентиль); на системах канализации - плоскость
          раструба тройника; по электрооборудованию - отходящий от аппарата защиты провод квартирной электросети; по
          строительным конструкциям – внутренняя поверхность стен квартиры, оконные заполнения и входная дверь в квартиру.
        </p>

        {/* Section 3 */}
        <h4 className="font-bold text-center my-3">3. ПРАВА И ОБЯЗАННОСТИ СТОРОН</h4>
        <p className="font-semibold mb-1">3.1. Управляющая компания обязана:</p>
        <ul className="list-disc list-inside pl-2 mb-2 space-y-1">
          <li>Осуществлять управление общим имуществом в соответствии с условиями настоящего Договора и действующим законодательством</li>
          <li>Осуществлять начисление Собственникам плату за содержание и ремонт общего имущества</li>
          <li>Организовать аварийно-диспетчерское обслуживание Многоквартирного дома, устранять аварии</li>
          <li>Информировать Собственников об изменении размера платы за помещение</li>
          <li>По требованию Собственников производить сверку платы за содержание и ремонт</li>
          <li>Представлять Собственникам ежеквартальный отчет о выполнении Договора</li>
        </ul>

        <p className="font-semibold mb-1">3.2. Управляющая компания вправе:</p>
        <ul className="list-disc list-inside pl-2 mb-2 space-y-1">
          <li>Самостоятельно определять порядок и способ выполнения своих обязательств</li>
          <li>Привлекать для выполнения работ сторонние организации</li>
          <li>Взыскивать с виновных сумму задолженности и ущерба</li>
          <li>Производить осмотры инженерного оборудования</li>
        </ul>

        <p className="font-semibold mb-1">3.3. Собственник обязан:</p>
        <ul className="list-disc list-inside pl-2 mb-2 space-y-1">
          <li>Своевременно и полностью вносить плату за услуги Управляющей компании</li>
          <li>Согласовывать намерения о перепланировке помещений</li>
          <li>Не производить перенос и замену внутренних инженерных сетей без согласования</li>
          <li>Не допускать выполнение работ, приводящих к порче общего имущества</li>
          <li>Не создавать повышенный шум с 22:00 до 8:00</li>
          <li>Обеспечить доступ представителей Управляющей компании для осмотра</li>
        </ul>

        <p className="font-semibold mb-1">3.4. Собственник имеет право:</p>
        <ul className="list-disc list-inside pl-2 mb-2 space-y-1">
          <li>Осуществлять контроль над выполнением обязательств Управляющей компании</li>
          <li>Требовать представления отчета о выполнении услуг</li>
        </ul>

        {/* Section 4 */}
        <h4 className="font-bold text-center my-3">4. РАЗМЕР ПЛАТЫ И ПОРЯДОК ВНЕСЕНИЯ</h4>
        <p className="mb-2 text-justify">
          4.1. Размер платы за услуги устанавливается пропорционально занимаемому Собственником помещению, согласно ст.132-134 ЖК РУз.
        </p>
        <p className="mb-2 text-justify">
          4.2. Размер платы Собственника состоит из: стоимости услуг по управлению; стоимости работ по содержанию общего имущества;
          стоимости работ по текущему ремонту.
        </p>
        <p className="mb-2 text-justify">
          4.3. Плата вносится ежемесячно до 10 (десятого) числа месяца, следующего за расчетным.
        </p>
        <p className="mb-2 text-justify">
          4.4. При просрочке более 3-х месяцев вопрос передается в Третейский или Гражданский Суд. Пени составляют 0,1% за
          каждый день просрочки, но не более 50% от общей суммы долга.
        </p>

        {/* Section 5 */}
        <h4 className="font-bold text-center my-3">5. ОТВЕТСТВЕННОСТЬ СТОРОН</h4>
        <p className="mb-2 text-justify">
          5.1. За неисполнение или ненадлежащее исполнение настоящего Договора Стороны несут ответственность в соответствии
          с действующим законодательством Республики Узбекистан.
        </p>
        <p className="mb-2 text-justify">
          5.2. Управляющая компания несет ответственность за ущерб, причинённый имуществу Собственников в результате ее
          действий или бездействий.
        </p>

        {/* Section 6 */}
        <h4 className="font-bold text-center my-3">6. ПОРЯДОК ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА</h4>
        <p className="mb-2 text-justify">
          6.1. Изменение и расторжение договора осуществляются в порядке, предусмотренном гражданским законодательством.
        </p>
        <p className="mb-2 text-justify">
          6.2. Настоящий Договор может быть расторгнут: по соглашению сторон; в судебном порядке; в связи с окончанием срока
          действия и письменным уведомлением за 30 дней; вследствие форс-мажора.
        </p>

        {/* Section 7 */}
        <h4 className="font-bold text-center my-3">7. ОСОБЫЕ УСЛОВИЯ</h4>
        <p className="mb-2 text-justify">
          Все споры, возникшие из Договора, разрешаются путем переговоров. При недостижении согласия - в судебном порядке.
        </p>

        {/* Section 8 */}
        <h4 className="font-bold text-center my-3">8. ФОРС-МАЖОР</h4>
        <p className="mb-2 text-justify">
          Управляющая компания не несет ответственность, если надлежащее исполнение оказалось невозможным вследствие
          непреодолимой силы (чрезвычайных и непредотвратимых обстоятельств).
        </p>

        {/* Section 9 */}
        <h4 className="font-bold text-center my-3">9. СРОК ДЕЙСТВИЯ ДОГОВОРА</h4>
        <p className="mb-2 text-justify">
          9.1. Настоящий Договор вступает в силу c момента заключения на основании протокола собрания.
        </p>
        <p className="mb-2 text-justify">
          9.2. При отсутствии заявлений о прекращении за 30 дней до окончания срока, договор продлевается на следующий
          календарный год.
        </p>
        <p className="mb-2 text-justify">
          9.3. Настоящий Договор составлен в двух экземплярах по одному для каждой из Сторон. Оба экземпляра имеют
          одинаковую юридическую силу.
        </p>

        {/* Signatures */}
        <div className="mt-6 pt-4 border-t-2 border-gray-300">
          <h4 className="font-bold text-center mb-4">РЕКВИЗИТЫ И ПОДПИСИ СТОРОН</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-bold text-xs mb-2">УК: ООО "KAMIZO"</p>
              <p className="text-[10px] text-gray-600">г. Ташкент, Яшнобадский район,</p>
              <p className="text-[10px] text-gray-600">ул. Махтумкули, дом 93/3</p>
              <p className="text-[10px] text-gray-600">Банк: «Ориент Финанс» ЧАКБ</p>
              <p className="text-[10px] text-gray-600">Р/С: 20208000805307918001</p>
              <p className="text-[10px] text-gray-600">ИНН: 307928888 МФО: 01071</p>
              {ukQrCodeUrl ? (
                <img src={ukQrCodeUrl} alt="UK QR" className="w-20 h-20 mx-auto mt-2" />
              ) : (
                <div className="w-20 h-20 mx-auto mt-2 bg-gray-200 rounded animate-pulse" />
              )}
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="font-bold text-xs mb-2">СОБСТВЕННИК:</p>
              <p className="text-[10px] text-gray-800 font-medium">{user.name}</p>
              <p className="text-[10px] text-gray-600 break-words">Адрес: {user.address}{user.apartment ? `, кв. ${user.apartment}` : ''}</p>
              <p className="text-[10px] text-gray-600">Тел: {user.phone || '___'}</p>
              <p className="text-[10px] text-gray-600">Л/С: {user.login}</p>
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="Resident QR" className="w-20 h-20 mx-auto mt-2" />
              ) : (
                <div className="w-20 h-20 mx-auto mt-2 bg-gray-200 rounded animate-pulse" />
              )}
              {user.contractSignedAt && (
                <p className="text-xs text-green-600 mt-2 flex items-center justify-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3" />
                  {language === 'ru' ? 'Подписано электронно' : 'Elektron imzolangan'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Download hint at bottom */}
      <div className="px-4 py-3 bg-yellow-50 border-t border-yellow-200 text-center">
        <p className="text-xs text-yellow-800">
          {language === 'ru'
            ? '📄 Это превью договора. Для получения официального документа в формате DOCX нажмите "Скачать договор"'
            : '📄 Bu shartnoma ko\'rinishi. Rasmiy hujjatni DOCX formatida olish uchun "Shartnomani yuklash" tugmasini bosing'
          }
        </p>
      </div>
    </div>
  );
}
