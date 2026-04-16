type Lang = 'ru' | 'uz';

interface RuForms { one: string; few: string; many: string }
interface UzForms { one: string; other: string }

const ruPR = new Intl.PluralRules('ru-RU');
const uzPR = new Intl.PluralRules('uz-UZ');

export function pluralRu(n: number, forms: RuForms): string {
  switch (ruPR.select(n)) {
    case 'one': return forms.one;
    case 'few': return forms.few;
    default:    return forms.many;
  }
}

export function pluralUz(n: number, forms: UzForms): string {
  return uzPR.select(n) === 'one' ? forms.one : forms.other;
}

export function plural(lang: Lang, n: number, ru: RuForms, uz: UzForms): string {
  return lang === 'ru' ? pluralRu(n, ru) : pluralUz(n, uz);
}

export function pluralWithCount(lang: Lang, n: number, ru: RuForms, uz: UzForms): string {
  return `${n} ${plural(lang, n, ru, uz)}`;
}
