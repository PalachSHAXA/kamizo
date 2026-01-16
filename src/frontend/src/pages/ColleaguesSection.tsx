import { useState, useEffect } from 'react';
import { Star, X, Users, Award, TrendingUp, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
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
const getDepartmentName = (specialization: ExecutorSpecialization): string => {
  const departments: Record<ExecutorSpecialization, string> = {
    plumber: 'Сантехнический отдел',
    electrician: 'Электротехнический отдел',
    elevator: 'Лифтовая служба',
    intercom: 'Домофонная служба',
    cleaning: 'Клининг',
    security: 'Служба безопасности',
    carpenter: 'Столярный отдел',
    boiler: 'Котельная служба',
    ac: 'Климат-контроль',
    courier: 'Служба доставки',
    other: 'Общий отдел',
  };
  return departments[specialization] || 'Общий отдел';
};

// Функция для генерации аватара на основе имени
const getAvatarUrl = (name: string, id: string): string => {
  // Используем DiceBear API для генерации аватаров на основе имени
  const seed = encodeURIComponent(name + id);
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=f59e0b,eab308,84cc16,22c55e,14b8a6,06b6d4,0ea5e9,3b82f6,6366f1,8b5cf6,a855f7,d946ef,ec4899,f43f5e&backgroundType=gradientLinear`;
};

// Функция для генерации бейджей на основе рейтинга
const generateBadges = (rating: number, completedCount: number): string[] => {
  const badges: string[] = [];
  if (rating >= 4.8) badges.push('Профессионал');
  if (rating >= 4.5) badges.push('Надёжность');
  if (completedCount >= 100) badges.push('Опытный мастер');
  if (completedCount >= 50) badges.push('Мастер');
  return badges.slice(0, 2); // Максимум 2 бейджа
};

const criteriaLabels = {
  professionalKnowledge: 'Профессиональные знания',
  legislationKnowledge: 'Знание законодательства',
  analyticalSkills: 'Аналитические способности',
  qualityOfWork: 'Качество работы',
  execution: 'Исполнительность',
  reliability: 'Надёжность',
  teamwork: 'Командность',
  communication: 'Коммуникация',
  initiative: 'Инициативность',
  humanity: 'Человечность',
};

const thankReasons = [
  'Помог с задачей',
  'Поддержал в сложный момент',
  'Научил чему-то новому',
  'Выручил в дедлайн',
  'Просто спасибо',
];

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
function RatingModal({ employee, onClose, onSubmit }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (ratings: Rating['ratings']) => void;
}) {
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

  const handleSubmit = () => {
    const allRated = Object.values(ratings).every(r => r > 0);
    if (!allRated) {
      alert('Пожалуйста, оцените все критерии');
      return;
    }
    onSubmit(ratings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-bold truncate pr-4">Оценить: {employee.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">Ваша оценка абсолютно анонимна</p>
          </div>

          <div className="space-y-4">
            {Object.entries(criteriaLabels).map(([key, label]) => (
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
            <label className="block text-sm font-medium mb-2">Комментарий (необязательно)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
              rows={4}
              placeholder="Поделитесь своими мыслями..."
            />
          </div>

          <button
            onClick={handleSubmit}
            className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Отправить оценку
          </button>
        </div>
      </div>
    </div>
  );
}

// Модальное окно благодарности
function ThankModal({ employee, onClose, onSubmit }: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (reason: string, isAnonymous: boolean) => void;
}) {
  const [reason, setReason] = useState(thankReasons[0]);
  const [isAnonymous, setIsAnonymous] = useState(false);

  const handleSubmit = () => {
    onSubmit(reason, isAnonymous);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold truncate pr-4">Поблагодарить: {employee.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 py-4">
          <label className="block text-sm font-medium mb-2">За что спасибо?</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
          >
            {thankReasons.map((r) => (
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
            <span className="text-sm">Отправить анонимно</span>
          </label>

          <button
            onClick={handleSubmit}
            className="w-full mt-6 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg transition-colors"
          >
            Отправить спасибо
          </button>
        </div>
      </div>
    </div>
  );
}

// Профиль сотрудника
function EmployeeProfile({ employee, onBack, thanks }: {
  employee: Employee;
  onBack: () => void;
  thanks: Thank[];
}) {
  const avgRating = (Object.values(employee.ratings).reduce((a, b) => a + b, 0) / 10).toFixed(1);
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
          <img
            src={employee.photo}
            alt={employee.name}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover flex-shrink-0"
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
        <h2 className="text-lg font-bold mb-4">Оценки по критериям</h2>
        <div className="space-y-3">
          {Object.entries(criteriaLabels).map(([key, label]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
              <span className="text-sm truncate">{label}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StarRating rating={employee.ratings[key as keyof typeof employee.ratings]} size="sm" />
                <span className="text-sm font-medium w-8 text-right">
                  {employee.ratings[key as keyof typeof employee.ratings].toFixed(1)}
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
                  {new Date(thank.createdAt).toLocaleDateString()}
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
  return (
    <div className="glass-card p-4 sm:p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">Последние события</span>
      </h2>
      <div className="space-y-3">
        {news.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
            <MessageCircle className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm break-words">{item.text}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Топ коллег
function TopColleagues({ employees }: { employees: Employee[] }) {
  const sortedByRating = [...employees].sort((a, b) => {
    const avgA = Object.values(a.ratings).reduce((sum, r) => sum + r, 0) / 10;
    const avgB = Object.values(b.ratings).reduce((sum, r) => sum + r, 0) / 10;
    return avgB - avgA;
  });

  const topThree = sortedByRating.slice(0, 3);

  const getBestByCategory = (category: keyof Employee['ratings']) => {
    return [...employees].sort((a, b) => b.ratings[category] - a.ratings[category])[0];
  };

  if (employees.length === 0) {
    return null;
  }

  return (
    <div className="glass-card p-4 sm:p-6 mb-6 overflow-hidden">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Award className="w-5 h-5 text-primary-500 flex-shrink-0" />
        <span className="truncate">Лучшие коллеги месяца</span>
      </h2>

      <div className="space-y-3 mb-6">
        {topThree.map((emp, i) => {
          const avgRating = (Object.values(emp.ratings).reduce((a, b) => a + b, 0) / 10).toFixed(1);
          return (
            <div
              key={emp.id}
              className={`p-3 rounded-xl border-2 flex items-center gap-3 ${
                i === 0 ? 'border-orange-400 bg-orange-50' :
                i === 1 ? 'border-gray-300 bg-gray-50' :
                'border-orange-300 bg-orange-50'
              }`}
            >
              <span className="text-xl flex-shrink-0">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </span>
              <img
                src={emp.photo}
                alt={emp.name}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
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
                  <span className="text-xs font-bold flex-shrink-0 bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">{best.ratings[key].toFixed(1)}</span>
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
export function ColleaguesSection() {
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
      const mappedEmployees: Employee[] = executors.map((executor) => {
        // Генерируем рейтинги на основе общего рейтинга исполнителя
        const baseRating = executor.rating || 4.5;
        const variance = 0.3; // Небольшой разброс

        const generateRating = () => {
          const val = baseRating + (Math.random() - 0.5) * variance * 2;
          return Math.min(5, Math.max(3.5, parseFloat(val.toFixed(1))));
        };

        return {
          id: executor.id,
          name: executor.name,
          position: SPECIALIZATION_LABELS[executor.specialization] || 'Специалист',
          department: getDepartmentName(executor.specialization),
          photo: getAvatarUrl(executor.name, executor.id),
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
          totalRatings: executor.completedCount || Math.floor(Math.random() * 50) + 10,
          monthlyRatings: Math.floor(Math.random() * 10) + 1,
          badges: generateBadges(executor.rating || 4.5, executor.completedCount || 0),
        };
      });

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

  // Debug log
  console.log('[Colleagues] User:', user?.name, 'Role:', user?.role, 'Specialization:', userSpecialization);
  console.log('[Colleagues] Found executor:', currentExecutor?.name, 'Spec:', currentExecutor?.specialization);
  console.log('[Colleagues] mySpecialization:', mySpecialization);

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

  console.log('[Colleagues] myTeamEmployees:', myTeamEmployees.length, 'otherEmployees:', otherEmployees.length);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Users className="w-8 h-8 text-primary-500 flex-shrink-0" />
          <span>{language === 'ru' ? 'Мои коллеги' : 'Mening hamkasblarim'}</span>
        </h1>
      </div>

      {employees.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {language === 'ru' ? 'Нет данных о коллегах' : "Hamkasblar haqida ma'lumot yo'q"}
          </h3>
          <p className="text-gray-500">
            {language === 'ru' ? 'Список сотрудников пока пуст' : "Xodimlar ro'yxati hali bo'sh"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* My Team Section - For Department Heads and Executors */}
            {(isDepartmentHead || isExecutor) && myTeamEmployees.length > 0 && (
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  {language === 'ru'
                    ? (isDepartmentHead ? `Мои сотрудники (${myTeamEmployees.length})` : `Мой отдел: ${getDepartmentName(mySpecialization as ExecutorSpecialization)} (${myTeamEmployees.length})`)
                    : (isDepartmentHead ? `Mening xodimlarim (${myTeamEmployees.length})` : `Mening bo'limim (${myTeamEmployees.length})`)}
                </h2>
                <div className="space-y-3">
                  {myTeamEmployees.map((emp) => {
                    const isRated = ratedThisMonth.has(emp.id);
                    const avgRating = (Object.values(emp.ratings).reduce((a, b) => a + b, 0) / 10).toFixed(1);

                    return (
                      <div
                        key={emp.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 bg-blue-50/50 border border-blue-200 rounded-xl hover:bg-blue-50 hover:shadow-md transition-all"
                      >
                        <img
                          src={emp.photo}
                          alt={emp.name}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover cursor-pointer flex-shrink-0"
                          onClick={() => setSelectedEmployee(emp)}
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedEmployee(emp)}>
                          <h3 className="font-bold truncate">{emp.name}</h3>
                          <p className="text-sm text-gray-600 truncate">{emp.position}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <StarRating rating={parseFloat(avgRating)} size="sm" />
                            <span className="text-sm font-medium">{avgRating}</span>
                          </div>
                        </div>
                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => !isRated && setShowRatingModal(emp)}
                            disabled={isRated}
                            className={`flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
                              isRated
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-primary-500 hover:bg-primary-600 text-gray-900'
                            }`}
                          >
                            {isRated ? '✓ Оценено' : 'Оценить'}
                          </button>
                          <button
                            onClick={() => setShowThankModal(emp)}
                            className="flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors whitespace-nowrap"
                          >
                            ❤️ Спасибо
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
                  <div className="space-y-3">
                    {departmentGroups[deptName].map((emp) => {
                      const isRated = ratedThisMonth.has(emp.id);
                      const avgRating = (Object.values(emp.ratings).reduce((a, b) => a + b, 0) / 10).toFixed(1);

                      return (
                        <div
                          key={emp.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 bg-white/60 border border-gray-200 rounded-xl hover:bg-white/80 hover:shadow-md transition-all"
                        >
                          <img
                            src={emp.photo}
                            alt={emp.name}
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover cursor-pointer flex-shrink-0"
                            onClick={() => setSelectedEmployee(emp)}
                          />
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedEmployee(emp)}>
                            <h3 className="font-bold truncate">{emp.name}</h3>
                            <p className="text-sm text-gray-600 truncate">{emp.position}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <StarRating rating={parseFloat(avgRating)} size="sm" />
                              <span className="text-sm font-medium">{avgRating}</span>
                            </div>
                          </div>
                          <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => !isRated && setShowRatingModal(emp)}
                              disabled={isRated}
                              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
                                isRated
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : 'bg-primary-500 hover:bg-primary-600 text-gray-900'
                              }`}
                            >
                              {isRated ? '✓ Оценено' : 'Оценить'}
                            </button>
                            <button
                              onClick={() => setShowThankModal(emp)}
                              className="flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors whitespace-nowrap"
                            >
                              ❤️ Спасибо
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              // Default view - all employees
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-lg font-bold mb-4">
                  {language === 'ru' ? `Все сотрудники (${otherEmployees.length})` : `Barcha xodimlar (${otherEmployees.length})`}
                </h2>
                <div className="space-y-3">
                  {otherEmployees.map((emp) => {
                    const isRated = ratedThisMonth.has(emp.id);
                    const avgRating = (Object.values(emp.ratings).reduce((a, b) => a + b, 0) / 10).toFixed(1);

                    return (
                      <div
                        key={emp.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 bg-white/60 border border-gray-200 rounded-xl hover:bg-white/80 hover:shadow-md transition-all"
                      >
                        <img
                          src={emp.photo}
                          alt={emp.name}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover cursor-pointer flex-shrink-0"
                          onClick={() => setSelectedEmployee(emp)}
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedEmployee(emp)}>
                          <h3 className="font-bold truncate">{emp.name}</h3>
                          <p className="text-sm text-gray-600 truncate">{emp.position}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <StarRating rating={parseFloat(avgRating)} size="sm" />
                            <span className="text-sm font-medium">{avgRating}</span>
                          </div>
                        </div>
                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => !isRated && setShowRatingModal(emp)}
                            disabled={isRated}
                            className={`flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
                              isRated
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-primary-500 hover:bg-primary-600 text-gray-900'
                            }`}
                          >
                            {isRated ? '✓ Оценено' : 'Оценить'}
                          </button>
                          <button
                            onClick={() => setShowThankModal(emp)}
                            className="flex-1 sm:flex-none px-3 py-2 rounded-lg font-medium text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 transition-colors whitespace-nowrap"
                          >
                            ❤️ Спасибо
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <TopColleagues employees={employees} />
            <NewsFeed news={news} />
          </div>
        </div>
      )}

      {showRatingModal && (
        <RatingModal
          employee={showRatingModal}
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
