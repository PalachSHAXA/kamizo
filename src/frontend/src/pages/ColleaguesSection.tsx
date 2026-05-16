import { useState, useEffect, Component } from 'react';
import { Star, Users, Award, TrendingUp, Heart, MessageCircle, Loader2, CheckCircle } from 'lucide-react';
import { useExecutorStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { Modal, EmptyState } from '../components/common';
import { SPECIALIZATION_LABELS, type ExecutorSpecialization } from '../types';
import { EmployeeRow } from './colleagues/EmployeeRow';
import { RatingModal } from './colleagues/RatingModal';
import { EmployeeProfile } from './colleagues/EmployeeProfile';
import { NewsFeed } from './colleagues/NewsFeed';
import { TopColleagues } from './colleagues/TopColleagues';
import { ThankModal } from './colleagues/ThankModal';
import type { Employee, NewsItem, Rating, Thank } from './colleagues/types';

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

// Avatar + initialsOf moved to ./colleagues/Avatar in sprint 23.

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
  const executors = useExecutorStore(s => s.executors);
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);
  const isLoadingExecutors = useExecutorStore(s => s.isLoadingExecutors);
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
