// Числовой инпут без нативных spinner-стрелок.
//
// Фаза 0: нативный <input type="number"> рисует стрелки-спиннеры, которые
// перехватывают клик и сбивают фокус при быстром вводе (жалоба пользователя —
// «кнопка в поле не уходит, нельзя вписать цифру»). Легаси-форма это уже
// решила через type="text" + inputMode="numeric" (EstimatesPage.tsx:541-556).
// Здесь тот же приём, вынесенный в переиспользуемый компонент + поддержка
// дробных значений (кол-во штата 0.5, прибыль 7.5%).
import { useEffect, useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (n: number) => void;
  decimal?: boolean;         // разрешить дробную часть (0.5, 7.5)
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  blankZero?: boolean;       // показывать пусто вместо 0 (по умолчанию true)
}

export function NumericInput({
  value, onChange, decimal, placeholder, className, disabled, blankZero = true,
}: NumericInputProps) {
  const format = (v: number) => (blankZero && v === 0 ? '' : String(v));
  const [text, setText] = useState(() => format(value));

  // Синхронизация, когда value меняется извне (сброс формы, авто-подстановка
  // ФОТ и т.п.) и расходится с тем, что сейчас в поле.
  useEffect(() => {
    const parsed = text === '' || text === '.' ? 0 : Number(text);
    if (parsed !== value) setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        let raw = e.target.value.replace(',', '.');
        raw = decimal ? raw.replace(/[^\d.]/g, '') : raw.replace(/[^\d]/g, '');
        if (decimal) {
          const parts = raw.split('.');
          if (parts.length > 1) raw = parts[0] + '.' + parts.slice(1).join('');
        }
        setText(raw);
        onChange(raw === '' || raw === '.' ? 0 : Number(raw));
      }}
      className={className}
    />
  );
}
