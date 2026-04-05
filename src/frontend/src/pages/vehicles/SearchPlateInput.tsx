import { useState, useRef } from 'react';
import { UZFlag } from './UZFlag';
import { UZ_REGIONS } from './plateUtils';
import type { PlateParts } from './plateUtils';

interface SearchPlateInputProps {
  value: PlateParts;
  onChange: (value: PlateParts) => void;
  language: string;
  onSearch?: () => void;
}

export function SearchPlateInput({ value, onChange, language, onSearch }: SearchPlateInputProps) {
  const letters1Ref = useRef<HTMLInputElement>(null);
  const digitsRef = useRef<HTMLInputElement>(null);
  const letters2Ref = useRef<HTMLInputElement>(null);
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  const handleRegionSelect = (code: string) => {
    onChange({ ...value, region: code });
    setShowRegionDropdown(false);
    setTimeout(() => {
      letters1Ref.current?.focus();
    }, 100);
  };

  const handleLetters1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1);
    if (/^\d$/.test(val)) {
      onChange({ ...value, letters1: '', digits: val });
      digitsRef.current?.focus();
    } else {
      onChange({ ...value, letters1: val });
      if (val.length === 1) {
        digitsRef.current?.focus();
      }
    }
  };

  const handleDigitsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 3);
    onChange({ ...value, digits: val });
    if (val.length === 3) {
      letters2Ref.current?.focus();
    }
  };

  const handleLetters2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    onChange({ ...value, letters2: val });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'letters1' | 'digits' | 'letters2') => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      if (field === 'letters2') digitsRef.current?.focus();
      else if (field === 'digits') letters1Ref.current?.focus();
    }
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  const selectedRegion = UZ_REGIONS.find(r => r.code === value.region);
  const isLegalFormat = value.letters1 === '' && value.digits.length > 0;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative bg-white border-[3px] border-black rounded-xl shadow-xl overflow-visible w-full max-w-[380px]">
        <div className="flex items-center h-14 sm:h-20 bg-white rounded-xl">
          <div className="relative flex items-center justify-center border-r-2 border-black h-full px-2 sm:px-3 bg-gray-50 rounded-l-xl">
            <button
              type="button"
              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
              className="text-2xl sm:text-4xl font-bold text-center hover:text-primary-600 transition-colors cursor-pointer min-w-[36px] sm:min-w-[50px]"
            >
              {value.region || <span className="text-gray-300">01</span>}
            </button>

            {showRegionDropdown && (
              <>
                <div className="fixed inset-0 z-[50]" onClick={() => setShowRegionDropdown(false)} />
                <div className="absolute top-full left-0 mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-2xl z-[50] max-h-72 overflow-y-auto min-w-[280px]">
                  {UZ_REGIONS.map((region) => (
                    <button
                      key={region.code}
                      type="button"
                      onClick={() => handleRegionSelect(region.code)}
                      className={`w-full px-4 py-3 text-left hover:bg-primary-50 flex items-center gap-4 transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        value.region === region.code ? 'bg-primary-100 text-primary-700' : ''
                      }`}
                    >
                      <span className="text-2xl font-bold text-gray-700 w-10">{region.code}</span>
                      <span className="text-sm text-gray-600">
                        {language === 'ru' ? region.name : region.nameUz}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center px-1 sm:px-2 gap-0.5 sm:gap-1">
            <input
              ref={letters1Ref}
              type="text"
              value={value.letters1}
              onChange={handleLetters1Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters1')}
              className="w-6 sm:w-10 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder="A"
              maxLength={1}
            />
            <input
              ref={digitsRef}
              type="text"
              inputMode="numeric"
              value={value.digits}
              onChange={handleDigitsChange}
              onKeyDown={(e) => handleKeyDown(e, 'digits')}
              className="w-14 sm:w-20 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent tracking-wider"
              placeholder="123"
              maxLength={3}
            />
            <input
              ref={letters2Ref}
              type="text"
              value={value.letters2}
              onChange={handleLetters2Change}
              onKeyDown={(e) => handleKeyDown(e, 'letters2')}
              className="w-12 sm:w-20 text-2xl sm:text-4xl font-bold text-center outline-none bg-transparent uppercase"
              placeholder={isLegalFormat ? 'ABC' : 'BC'}
              maxLength={3}
            />
          </div>

          <div className="flex flex-col items-center justify-center border-l-2 border-black h-full px-1.5 sm:px-3 bg-gray-50 rounded-r-xl">
            <UZFlag />
            <span className="text-xs sm:text-sm font-bold mt-0.5">UZ</span>
          </div>
        </div>
      </div>

      {selectedRegion && (
        <p className="text-sm text-primary-600 mt-3 font-medium">
          {language === 'ru' ? selectedRegion.name : selectedRegion.nameUz}
        </p>
      )}

      <p className="text-xs text-gray-400 mt-1">
        {language === 'ru' ? 'Введите любую часть номера для поиска' : 'Qidirish uchun raqamning istalgan qismini kiriting'}
      </p>
    </div>
  );
}
