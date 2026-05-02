import { useState, useEffect, Component } from 'react';
import { Star, Users, Award, TrendingUp, Heart, MessageCircle, Loader2, CheckCircle } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { Modal, EmptyState } from '../components/common';
import { SPECIALIZATION_LABELS, type ExecutorSpecialization } from '../types';

// Типы данных
interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  photo: string;
  ratings: {
    professionalKnowledge: number;
    legislationKnowledge: number;
    analyticalSkills: number;
    qualityOfWork: number;
    execution: number;
    reliability: number;
    teamwork: number;
    communication: number;
    initiative: number;
    humanity: number;
  };
  totalRatings: number;
  monthlyRatings: number;
  badges: string[];
}

interface Rating {
  id: string;
  raterId: string;
  targetId: string;
  month: number;
  year: number;
  ratings: {
    professionalKnowledge: number;
    legislationKnowledge: number;
    analyticalSkills: number;
    qualityOfWork: number;
    execution: number;
    reliability: number;
    teamwork: number;
    communication: number;
    initiative: number;
    humanity: number;
  };
  comment: string;
  createdAt: string;
}

interface Thank {
  id: string;
  fromId: string;
  fromName?: string;
  toId: string;
  reason: string;
  isAnonymous: boolean;
  createdAt: string;
}

interface NewsItem {
  id: string;
  type: 'top' | 'thank' | 'department';
  text: string;
  createdAt: string;
}

// Функция для получения названия отдела по специализации
const getDepartmentName = (specialization: ExecutorSpecialization | undefined | null | string): string => {
  if (!specialization) return 'Общий отдел';
  const departments: Record<string, string> = {
    plumber: 'Сантехнический отдел',
    electrician: 'Электротехнический отдел',
    elevator: 'Лифтовая служба',
    intercom: 'Домофонная служба',
    cleaning: 'Клининг',
    security: 'Служба безопасности',
    trash: 'Служба вывоза мусора',
    boiler: 'Котельная служба',
    ac: 'Климат-контроль',
    courier: 'Служба доставки',
    gardener: 'Садово-парковая служба',
    other: 'Общий отдел',
  };
  return departments[specialization as string] || 'Общий отдел';
};

// Safe numeric formatter — returns "0.0" for non-finite values instead of crashing
const safeFixed = (n: number | undefined | null, digits = 1): string => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
};

// Compute average safely — returns 0 if ratings object missing/invalid
const safeAvgRating = (ratings: Employee['ratings'] | undefined): number => {
  if (!ratings) return 0;
  const values = Object.values(ratings).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
};

// Функция для генерации аватара на основе имени
const getAvatarUrl = (name: string, id: string): string => {
  // Используем DiceBear API для генерации аватаров на основе имени
  const seed = encodeURIComponent(name + id);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=f59e0b,eab308,84cc16,22c55e,14b8a6,06b6d4,0ea5e9,3b82f6,6366f1,8b5cf6,a855f7,d946ef,ec4899,f43f5e&backgroundType=gradientLinear`;
};

// Deterministic gradient (0-9) based on name+id, so fallback avatar keeps the
// same colour across renders.
const AVATAR_GRADIENTS = [
  'from-amber-400 to-orange-500',
  'from-lime-400 to-green-500',
  'from-teal-400 to-cyan-500',
  'from-sky-400 to-blue-500',
  'from-indigo-400 to-purple-500',
  'from-fuchsia-400 to-pink-500',
  'from-rose-400 to-red-500',
  'from-emerald-400 to-teal-500',
  'from-violet-400 to-indigo-500',
  'from-yellow-400 to-amber-500',
];
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_GRADIENTS.length;
}
function initialsOf(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Avatar with initials fallback. Previously the raw <img> showed alt-text
// (e.g. "📷 Bobur Toshmat") whenever DiceBear failed to respond — which is
// apparently common enough to warrant a local fallback.
function Avatar({ name, src, className, onClick }: {
  name: string;
  src: string;
  className?: string;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) {
    const gradient = AVATAR_GRADIENTS[hashSeed(name)];
    return (
      <div
        onClick={onClick}
        className={`bg-gradient-to-br ${gradient} text-white font-bold flex items-center justify-center select-none ${className || ''}`}
        aria-label={name}
      >
        {initialsOf(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      onClick={onClick}
      onError={() => setBroken(true)}
      className={className}
    />
  );
}

// Функция для генерации бейджей на основе рейтинга
const generateBadges = (rating: number, completedCount: number): string[] => {
  const badges: string[] = [];
  if (rating >= 4.8) badges.push('Профессионал');
  if (rating >= 4.5) badges.push('Надёжность');
  if (completedCount >= 100) badges.push('Опытный мастер');
  if (completedCount >= 50) badges.push('Мастер');
  return badges.slice(0, 2); // Максимум 2 бейджа
};

// Compact horizontal row for an employee card — previously each card was
// ~200px tall (avatar + name + full-width buttons stacked vertically). Now
// one row ≈ 72px: avatar, name+position+rating inline, two icon buttons on
// the right. Rating modal opens via the row itself or the star icon.
function EmployeeRow({
  emp,
  avgRating,
  isRated,
  onOpen,
  onRate,
  onThank,
  accent = 'default',
}: {
  emp: Employee;
  avgRating: string;
  isRated: boolean;
  onOpen: () => void;
  onRate: () => void;
  onThank: () => void;
  accent?: 'default' | 'team';
}) {
  const bg = accent === 'team'
    ? 'bg-primary-50/50 border-primary-200 hover:bg-primary-50'
    : 'bg-white/60 border-gray-200 hover:bg-white/80';
  return (
    <div
      className={`flex items-center gap-3 p-3 border rounded-xl transition-all hover:shadow-md ${bg}`}
    >
      <button onClick={onOpen} className="flex-shrink-0 touch-manipulation" aria-label={emp.name}>
        <Avatar
          name={emp.name}
          src={emp.photo}
          className="w-12 h-12 rounded-xl object-cover text-sm"
        />
      </button>
      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-bold text-sm truncate">{emp.name}</h3>
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 flex-shrink-0">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {avgRating}
          </span>
        </div>
        <p className="text-xs text-gray-500 truncate">{emp.position}</p>
      </button>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onRate}
          disabled={isRated}
          title={isRated ? 'Уже оценено' : 'Оценить'}
          aria-label={isRated ? 'Уже оценено' : 'Оценить'}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors touch-manipulation ${
            isRated
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-gray-900'
          }`}
        >
          {isRated ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
        </button>
        <button
          onClick={onThank}
          title="Спасибо"
          aria-label="Сказать спасибо"
          className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-50 hover:bg-purple-100 active:bg-purple-200 text-purple-600 transition-colors touch-manipulation"
        >
          <Heart className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const getLabels = (language: 'ru' | 'uz') => ({
  criteriaLabels: {
    professionalKnowledge: language === 'ru' ? 'Профессиональные знания' : 'Kasbiy bilimlar',
    legislationKnowledge: language === 'ru' ? 'Знание законодательства' : 'Qonunchilik bilimi',
    analyticalSkills: language === 'ru' ? 'Аналитические способности' : 'Tahlil qobiliyati',
    qualityOfWork: language === 'ru' ? 'Качество работы' : 'Ish sifati',
    execution: language === 'ru' ? 'Исполнительность' : 'Ijro etish',
    reliability: language === 'ru' ? 'Надёжность' : 'Ishonchlilik',
    teamwork: language === 'ru' ? 'Командность' : 'Jamoaviy ishlash',
    communication: language === 'ru' ? 'Коммуникация' : 'Muloqat',
    initiative: language === 'ru' ? 'Инициативность' : 'Tashabbusi',
    humanity: language === 'ru' ? 'Человечность' : 'Insoniylik',
  },
  thankReasons: [
    language === 'ru' ? 'Помог с задачей' : 'Vazifada yordam berdi',
    language === 'ru' ? 'Поддержал в сложный момент' : 'Qiyin vaqtda qo\'llab-quvvatladi',
    language === 'ru' ? 'Научил чему-то новому' : 'Yangi narsalar o\'rgatdi',
    language === 'ru' ? 'Выручил в дедлайн' : 'Muddatda yordam berdi',
    language === 'ru' ? 'Просто спасибо' : 'Shunchaki raxmat',
  ],
});

// Компонент звёзд
function StarRating({ rating, maxStars = 5, size = 'md', onChange }: {
  rating: number;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <div className="flex gap-1">
      {[...Array(maxStars)].map((_, i) => (
        <Star
          key={i}
          className={`${sizeClass} ${
            i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          } ${onChange ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
          onClick={() => onChange?.(i + 1)}
        />
      ))}
    </div>
  );
}

// Модальное окно оценки
//
// Жителю не нужно оценивать мастера по 10 HR-критериям вроде
// "аналитические способности" — это пугает и не релевантно. Для resident
// показываем 3 простых критерия (качество, вежливость, скорость), а
// остальные автоматически заполняем тем же средним, чтобы backend-логика
// агрегации и ранга в "Лучших мастеров" не ломалась.
function RatingModal({ employee, onClose, onSubmit, isResidentView }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (ratings: Rating['ratings']) => void;
  isResidentView: boolean;
}) {
  const { language } = useLanguageStore();
  const addToast = useToastStore(s => s.addToast);
  const labels = getLabels(language);
  const [ratings, setRatings] = useState<Rating['ratings']>({
    professionalKnowledge: 0,
    legislationKnowledge: 0,
    analyticalSkills: 0,
    qualityOfWork: 0,
    execution: 0,
    reliability: 0,
    teamwork: 0,
    communication: 0,
    initiative: 0,
    humanity: 0,
  });
  const [comment, setComment] = useState('');

  // Resident view sees only 3 criteria; they map to the backend's three
  // most resident-relevant dimensions.
  const residentCriteria: { key: keyof Rating['ratings']; label: { ru: string; uz: string } }[] = [
    { key: 'qualityOfWork', label: { ru: 'Качество работы', uz: 'Ish sifati' } },
    { key: 'humanity', label: { ru: 'Вежливость', uz: 'Xushmuomalalik' } },
    { key: 'execution', label: { ru: 'Скорость', uz: 'Tezlik' } },
  ];
  const visibleCriteria = isResidentView
    ? residentCriteria.map(c => [c.key, language === 'ru' ? c.label.ru : c.label.uz] as const)
    : (Object.entries(labels.criteriaLabels) as [keyof Rating['ratings'], string][]);

  const handleSubmit = () => {
    if (isResidentView) {
      // Require all 3 visible criteria to have a rating.
      const missing = residentCriteria.some(c => !ratings[c.key]);
      if (missing) {
        addToast('warning', language === 'ru' ? 'Пожалуйста, оцените все критерии' : 'Iltimos, barcha mezonlarni baholang');
        return;
      }
      // Auto-fill the rest with the average of the 3 given ratings.
      const avg = (ratings.qualityOfWork + ratings.humanity + ratings.execution) / 3;
      onSubmit({
        ...ratings,
        professionalKnowledge: avg,
        legislationKnowledge: avg,
        analyticalSkills: avg,
        reliability: avg,
        teamwork: avg,
        communication: avg,
        initiative: avg,
      });
      onClose();
      return;
    }

    const allRated = Object.values(ratings).every(r => r > 0);
    if (!allRated) {
      addToast('warning', language === 'ru' ? 'Пожалуйста, оцените все критерии' : 'Iltimos, barcha mezonlarni baholang');
      return;
    }
    onSubmit(ratings);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${language === 'ru' ? 'Оценить' : 'Baholash'}: ${employee.name}`} size="lg">
      <div className="max-h-[70dvh] overflow-y-auto">
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{language === 'ru' ? 'Ваша оценка абсолютно анонимна' : 'Sizning bahongiz mutlaqo anonimdir'}</p>
        </div>

        <div className="space-y-4">
          {visibleCriteria.map(([key, label]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              <StarRating
                rating={ratings[key as keyof typeof ratings]}
                onChange={(r) => setRatings({ ...ratings, [key]: r })}
              />
            </div>
          ))}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'Комментарий (необязательно)' : 'Izoh (ixtiyoriy)'}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            rows={4}
            placeholder={language === 'ru' ? 'Поделитесь своими мыслями...' : 'O\'z fikringizni baham ko\'ring...'}
          />
        </div>

        <button
          onClick={handleSubmit}
          className="w-full mt-6 bg-primary-500 hover:bg-primary-600 text-white font-medium py-3 rounded-lg transition-colors"
        >
          {language === 'ru' ? 'Отправить оценку' : 'Baholashni yuborish'}
        </button>
      </div>
    </Modal>
  );
}

// Модальное окно благодарности
function ThankModal({ employee, onClose, onSubmit }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (reason: string, isAnonymous: boolean) => void;
}) {
  const { language } = useLanguageStore();
  const labels = getLabels(language);
  const [reason, setReason] = useState(labels.thankReasons[0]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = () => {
    onSubmit(reason, isAnonymous);
    onClose();
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`${language === 'ru' ? 'Поблагодарить' : 'Raxmat aytish'}: ${employee.name}`} size="sm">
      <label className="block text-sm font-medium mb-2">{language === 'ru' ? 'За что спасибо?' : 'Nima uchun raxmat?'}</label>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
      >
        {labels.thankReasons.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm">{language === 'ru' ? 'Отправить анонимно' : 'Anonimly yuborish'}</span>
      </label>

      <button
        onClick={handleSubmit}
        className="w-full mt-6 bg-primary-500 hover:bg-primary-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {language === 'ru' ? 'Отправить спасибо' : 'Raxamatni yuborish'}
      </button>
    </Modal>
  );
}

// Профиль сотрудника
function EmployeeProfile({ employee, onBack, thanks }: {
  employee: Employee;
  onBack: () => void;
  thanks: Thank[];
}) {
  const { language } = useLanguageStore();
  const avgRating = safeFixed(safeAvgRating(employee.ratings));
  const employeeThanks = thanks.filter(t => t.toId === employee.id);

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-800 font-medium"
      >
        ← Назад к списку
      </button>

      <div className="glass-card p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          <Avatar
            name={employee.name}
            src={employee.photo}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover flex-shrink-0 text-2xl"
          />
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{employee.name}</h1>
            <p className="text-gray-600 mb-1">{employee.position}</p>
            <p className="text-sm text-gray-500">{employee.department}</p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-4 mt-4">
              <div className="flex items-center gap-2">
                <StarRating rating={parseFloat(avgRating)} size="sm" />
                <span className="font-bold text-lg">{avgRating}</span>
              </div>
              <div className="text-sm text-gray-600">
                {employee.totalRatings} оценок
              </div>
              <div className="text-sm text-gray-600">
                {employee.monthlyRatings} в этом месяце
              </div>
            </div>

            {employee.badges.length > 0 && (
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {employee.badges.map((badge, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full flex items-center gap-1"
                  >
                    <Award className="w-3 h-3" />
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">{language === 'ru' ? 'Оценки по критериям' : 'Mezonlar bo\'yicha baholar'}</h2>
        <div className="space-y-3">
          {Object.entries(getLabels(language).criteriaLabels).map(([key, label]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-sm truncate">{label}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StarRating rating={employee.ratings?.[key as keyof typeof employee.ratings] ?? 0} size="sm" />
                <span className="text-sm font-medium w-8 text-right">
                  {safeFixed(employee.ratings?.[key as keyof typeof employee.ratings])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-4">Полученные благодарности ({employeeThanks.length})</h2>
        {employeeThanks.length === 0 ? (
          <p className="text-gray-500 text-sm">Пока нет благодарностей</p>
        ) : (
          <div className="space-y-3">
            {employeeThanks.map((thank) => (
              <div key={thank.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Heart className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {thank.isAnonymous ? 'Анонимно' : thank.fromName}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{thank.reason}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(thank.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Лента новостей
function NewsFeed({ news }: { news: NewsItem[] }) {
  const { language } = useLanguageStore();
  return (
    <div className="glass-card p-4 sm:p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">{language === 'ru' ? 'Последние события' : "So'nggi voqealar"}</span>
      </h2>
      <div className="space-y-3">
        {news.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <MessageCircle className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm break-words">{item.text}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.createdAt).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Топ коллег
function TopColleagues({ employees, isResidentView }: { employees: Employee[]; isResidentView: boolean }) {
  const sortedByRating = [...employees].sort((a, b) => safeAvgRating(b.ratings) - safeAvgRating(a.ratings));

  const topThree = sortedByRating.slice(0, 3);

  const getBestByCategory = (category: keyof Employee['ratings']) => {
    return [...employees].sort((a, b) => (b.ratings?.[category] ?? 0) - (a.ratings?.[category] ?? 0))[0];
  };

  if (employees.length === 0) {
    return null;
  }

  // Residents don't have "colleagues" here — they're rating building staff.
  const heading = isResidentView ? 'Лучшие мастера месяца' : 'Лучшие коллеги месяца';

  return (
    <div className="glass-card p-4 sm:p-6 mb-6 overflow-hidden">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">{heading}</span>
      </h2>

      <div className="space-y-3 mb-6">
        {topThree.map((emp, i) => {
          const avgRating = safeFixed(safeAvgRating(emp.ratings));
          return (
            <div
              key={emp.id}
              className={`p-3 rounded-xl border-2 flex items-center gap-3 ${
                i === 0 ? 'border-primary-400 bg-primary-50' :
                i === 1 ? 'border-gray-300 bg-gray-50' :
                'border-primary-300 bg-primary-50'
              }`}
            >
              <span className="text-xl flex-shrink-0">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </span>
              <Avatar
                name={emp.name}
                src={emp.photo}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 text-sm"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm truncate">{emp.name}</h3>
                <p className="text-xs text-gray-600 truncate">{emp.position}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-bold">{avgRating}</span>
              </div>
            </div>
          );
        })}
      </div>

      {employees.length > 0 && (
        <>
          <h3 className="font-bold mb-3 text-sm">Лидеры по категориям</h3>
          <div className="space-y-2">
            {[
              { key: 'teamwork' as const, label: 'Командность', icon: '🤝' },
              { key: 'professionalKnowledge' as const, label: 'Знания', icon: '🎓' },
              { key: 'communication' as const, label: 'Коммуникация', icon: '💬' },
              { key: 'initiative' as const, label: 'Инициативность', icon: '🚀' },
            ].map(({ key, label, icon }) => {
              const best = getBestByCategory(key);
              if (!best) return null;
              return (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className="flex-shrink-0">{icon}</span>
                  <span className="text-xs text-gray-500 flex-shrink-0 w-24">{label}</span>
                  <span className="text-xs font-medium flex-1 min-w-0 truncate">{best.name}</span>
                  <span className="text-xs font-bold flex-shrink-0 bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">{safeFixed(best.ratings?.[key])}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

// Основной компонент
// Local error boundary — if inner render throws due to unexpected executor data
// shape, show a friendly empty state instead of the full-page React Error Boundary.
class ColleaguesErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('[ColleaguesSection] render failed:', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Users className="w-12 h-12" />}
            title="Сотрудники"
            description="Данные временно недоступны. Попробуйте позже."
          />
        </div>
      );
    }
    return this.props.children;
  }
}

export function ColleaguesSection() {
  return (
    <ColleaguesErrorBoundary>
      <ColleaguesSectionInner />
    </ColleaguesErrorBoundary>
  );
}

function ColleaguesSectionInner() {
  const { language } = useLanguageStore();
  const { executors, fetchExecutors, isLoadingExecutors } = useDataStore();
  const { user } = useAuthStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [ratedThisMonth, setRatedThisMonth] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showRatingModal, setShowRatingModal] = useState<Employee | null>(null);
  const [showThankModal, setShowThankModal] = useState<Employee | null>(null);
  const [thanks, setThanks] = useState<Thank[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);

  // Загружаем ВСЕХ исполнителей при монтировании (для страницы коллег)
  useEffect(() => {
    // Pass true to get all executors regardless of department
    fetchExecutors(true);
  }, [fetchExecutors]);

  // Конвертируем исполнителей в Employee формат
  useEffect(() => {
    if (executors.length > 0) {
      // Defensive mapping wrapped in try/catch — if a specific executor row is
      // malformed (unexpected specialization type, non-serializable fields),
      // we skip it rather than crash the entire page via Error Boundary.
      try {
      const mappedEmployees: Employee[] = executors
        .filter((e) => e && e.id) // skip totally broken rows
        .map((executor) => {
          const baseRating = (typeof executor.rating === 'number' && Number.isFinite(executor.rating)) ? executor.rating : 4.5;
          const variance = 0.3;
          const generateRating = () => {
            const val = baseRating + (Math.random() - 0.5) * variance * 2;
            return Math.min(5, Math.max(3.5, parseFloat(val.toFixed(1))));
          };
          const name = (executor.name && String(executor.name).trim()) || 'Сотрудник';
          const spec = executor.specialization as string | undefined;
          return {
            id: executor.id,
            name,
            position: (spec && SPECIALIZATION_LABELS[spec as keyof typeof SPECIALIZATION_LABELS]) || 'Специалист',
            department: getDepartmentName(spec),
            photo: getAvatarUrl(name, executor.id),
            ratings: {
              professionalKnowledge: generateRating(),
              legislationKnowledge: generateRating(),
              analyticalSkills: generateRating(),
              qualityOfWork: generateRating(),
              execution: generateRating(),
              reliability: generateRating(),
              teamwork: generateRating(),
              communication: generateRating(),
              initiative: generateRating(),
              humanity: generateRating(),
            },
            totalRatings: (typeof executor.completedCount === 'number' && executor.completedCount >= 0)
              ? executor.completedCount
              : Math.floor(Math.random() * 50) + 10,
            monthlyRatings: Math.floor(Math.random() * 10) + 1,
            badges: generateBadges(baseRating, executor.completedCount || 0),
          };
        });

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmployees(mappedEmployees);

      // Генерируем начальные новости
      if (mappedEmployees.length > 0) {
        const initialNews: NewsItem[] = [
          {
            id: '1',
            type: 'top',
            text: `${mappedEmployees[0]?.name || 'Сотрудник'} вошёл в топ лучших коллег месяца!`,
            createdAt: new Date().toISOString(),
          },
          {
            id: '2',
            type: 'department',
            text: 'Команда показывает отличные результаты в этом месяце',
            createdAt: new Date().toISOString(),
          },
        ];
        setNews(initialNews);
      }
      } catch (err) {
        console.error('[ColleaguesSection] Failed to map executors to employees:', err);
        setEmployees([]);
      }
    }
  }, [executors]);

  // Текущий пользователь (для примера)
  const currentUserId = 'current-user';

  const handleSubmitRating = (targetId: string, ratings: Rating['ratings']) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.id === targetId) {
        const newRatings = { ...emp.ratings };
        Object.keys(ratings).forEach(key => {
          const k = key as keyof typeof ratings;
          const current = emp.ratings[k];
          const totalCount = emp.totalRatings;
          newRatings[k] = parseFloat((((current * totalCount) + ratings[k]) / (totalCount + 1)).toFixed(1));
        });

        return {
          ...emp,
          ratings: newRatings,
          totalRatings: emp.totalRatings + 1,
          monthlyRatings: emp.monthlyRatings + 1,
        };
      }
      return emp;
    }));

    setRatedThisMonth(prev => new Set([...prev, targetId]));

    const employee = employees.find(e => e.id === targetId);
    if (employee) {
      setNews(prev => [{
        id: Date.now().toString(),
        type: 'top',
        text: `${employee.name} получил новую оценку!`,
        createdAt: new Date().toISOString(),
      }, ...prev]);
    }
  };

  const handleSubmitThank = (targetId: string, reason: string, isAnonymous: boolean) => {
    const newThank: Thank = {
      id: Date.now().toString(),
      fromId: currentUserId,
      fromName: isAnonymous ? undefined : 'Вы',
      toId: targetId,
      reason,
      isAnonymous,
      createdAt: new Date().toISOString(),
    };

    setThanks(prev => [newThank, ...prev]);

    const employee = employees.find(e => e.id === targetId);
    if (employee && !isAnonymous) {
      setNews(prev => [{
        id: Date.now().toString(),
        type: 'thank',
        text: `${employee.name} получил благодарность: "${reason}"`,
        createdAt: new Date().toISOString(),
      }, ...prev]);
    }
  };

  // Показываем загрузку
  if (isLoadingExecutors && employees.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
          <p className="text-gray-600">Загрузка коллег...</p>
        </div>
      </div>
    );
  }

  if (selectedEmployee) {
    return (
      <EmployeeProfile
        employee={selectedEmployee}
        onBack={() => setSelectedEmployee(null)}
        thanks={thanks}
      />
    );
  }

  // Check user role for department organization
  const isDepartmentHead = user?.role === 'department_head';
  const isExecutor = user?.role === 'executor';
  const userSpecialization = user?.specialization;

  // For executors and department heads, find their executor record to get specialization
  // Try to find by login first, then by user id
  const currentExecutor = (isExecutor || isDepartmentHead)
    ? executors.find(e => e.login === user?.login || e.id === user?.id)
    : null;
  // Use user's specialization directly if available (for department_head), otherwise from executor record
  const mySpecialization = userSpecialization || currentExecutor?.specialization;


  // Separate employees into department (my team) and others
  const myTeamEmployees = mySpecialization
    ? employees.filter(emp => {
        // Find the original executor to get specialization
        const executor = executors.find(e => e.id === emp.id);
        // Also exclude current user from the list (by id or login)
        const isCurrentUser = executor?.id === user?.id || executor?.login === user?.login;
        return executor?.specialization === mySpecialization && !isCurrentUser;
      })
    : [];

  const otherEmployees = mySpecialization
    ? employees.filter(emp => {
        const executor = executors.find(e => e.id === emp.id);
        const isCurrentUser = executor?.id === user?.id || executor?.login === user?.login;
        return executor?.specialization !== mySpecialization && !isCurrentUser;
      })
    : employees.filter(emp => {
        const executor = executors.find(e => e.id === emp.id);
        const isCurrentUser = executor?.id === user?.id || executor?.login === user?.login;
        return !isCurrentUser;
      });


  // Group other employees by department for better organization
  const departmentGroups = otherEmployees.reduce((groups, emp) => {
    const executor = executors.find(e => e.id === emp.id);
    const dept = executor?.specialization ? getDepartmentName(executor.specialization) : 'Другие';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(emp);
    return groups;
  }, {} as Record<string, Employee[]>);

  // Sort department groups - own department first
  const sortedDepartments = Object.keys(departmentGroups).sort((a, b) => {
    const myDeptName = mySpecialization ? getDepartmentName(mySpecialization) : '';
    if (a === myDeptName) return -1;
    if (b === myDeptName) return 1;
    return a.localeCompare(b);
  });

  // Title swaps based on viewer role. A resident viewing this page sees
  // "Мастера" — plumbers and electricians aren't their colleagues, they're
  // service staff. Staff members see "Мои коллеги".
  const isResidentView = user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner';
  const pageTitle = isResidentView
    ? (language === 'ru' ? 'Мастера УК' : 'UK ustalari')
    : (language === 'ru' ? 'Мои коллеги' : 'Mening hamkasblarim');

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8 text-primary-500 flex-shrink-0" />
          <span>{pageTitle}</span>
        </h1>
      </div>

      {employees.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={language === 'ru' ? 'Нет данных о коллегах' : "Hamkasblar haqida ma'lumot yo'q"}
          description={language === 'ru' ? 'Список сотрудников пока пуст' : "Xodimlar ro'yxati hali bo'sh"}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div className="lg:col-span-2 xl:col-span-3 space-y-6">
            {/* My Team Section - For Department Heads and Executors */}
            {(isDepartmentHead || isExecutor) && myTeamEmployees.length > 0 && (
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                  {language === 'ru'
                    ? (isDepartmentHead ? `Мои сотрудники (${myTeamEmployees.length})` : `Мой отдел: ${getDepartmentName(mySpecialization as ExecutorSpecialization)} (${myTeamEmployees.length})`)
                    : (isDepartmentHead ? `Mening xodimlarim (${myTeamEmployees.length})` : `Mening bo'limim (${myTeamEmployees.length})`)}
                </h2>
                <div className="space-y-2">
                  {myTeamEmployees.map((emp) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      avgRating={safeFixed(safeAvgRating(emp.ratings))}
                      isRated={ratedThisMonth.has(emp.id)}
                      onOpen={() => setSelectedEmployee(emp)}
                      onRate={() => !ratedThisMonth.has(emp.id) && setShowRatingModal(emp)}
                      onThank={() => setShowThankModal(emp)}
                      accent="team"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other Colleagues Section - Organized by Department */}
            {(isDepartmentHead || isExecutor) && sortedDepartments.length > 0 ? (
              // Show grouped by department
              sortedDepartments.map((deptName) => (
                <div key={deptName} className="glass-card p-4 sm:p-6">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    {deptName} ({departmentGroups[deptName].length})
                  </h2>
                  <div className="space-y-2">
                    {departmentGroups[deptName].map((emp) => (
                      <EmployeeRow
                        key={emp.id}
                        emp={emp}
                        avgRating={safeFixed(safeAvgRating(emp.ratings))}
                        isRated={ratedThisMonth.has(emp.id)}
                        onOpen={() => setSelectedEmployee(emp)}
                        onRate={() => !ratedThisMonth.has(emp.id) && setShowRatingModal(emp)}
                        onThank={() => setShowThankModal(emp)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // Default view - all employees
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-lg font-bold mb-4">
                  {language === 'ru' ? `Все сотрудники (${otherEmployees.length})` : `Barcha xodimlar (${otherEmployees.length})`}
                </h2>
                <div className="space-y-2">
                  {otherEmployees.map((emp) => (
                    <EmployeeRow
                      key={emp.id}
                      emp={emp}
                      avgRating={safeFixed(safeAvgRating(emp.ratings))}
                      isRated={ratedThisMonth.has(emp.id)}
                      onOpen={() => setSelectedEmployee(emp)}
                      onRate={() => !ratedThisMonth.has(emp.id) && setShowRatingModal(emp)}
                      onThank={() => setShowThankModal(emp)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <TopColleagues employees={employees} isResidentView={isResidentView} />
            <NewsFeed news={news} />
          </div>
        </div>
      )}

      {showRatingModal && (
        <RatingModal
          employee={showRatingModal}
          isResidentView={isResidentView}
          onClose={() => setShowRatingModal(null)}
          onSubmit={(ratings) => {
            handleSubmitRating(showRatingModal.id, ratings);
            setShowRatingModal(null);
          }}
        />
      )}

      {showThankModal && (
        <ThankModal
          employee={showThankModal}
          onClose={() => setShowThankModal(null)}
          onSubmit={(reason, isAnonymous) => {
            handleSubmitThank(showThankModal.id, reason, isAnonymous);
            setShowThankModal(null);
          }}
        />
      )}
    </div>
  );
}
