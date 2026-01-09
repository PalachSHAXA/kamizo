# Design System - UK CRM

## Glassmorphism Guidelines

### Основные принципы

Glassmorphism создает эффект "матового стекла" с многослойностью и глубиной.

### CSS Variables

```css
:root {
  /* Colors */
  --glass-bg: rgba(255, 255, 255, 0.1);
  --glass-bg-hover: rgba(255, 255, 255, 0.15);
  --glass-border: rgba(255, 255, 255, 0.2);
  --glass-shadow: rgba(0, 0, 0, 0.1);

  /* Dark mode */
  --glass-bg-dark: rgba(0, 0, 0, 0.2);
  --glass-border-dark: rgba(255, 255, 255, 0.1);

  /* Blur */
  --blur-sm: 4px;
  --blur-md: 10px;
  --blur-lg: 20px;

  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --gradient-secondary: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --gradient-success: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Border Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Typography */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;
}
```

### Glass Card Component

```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px var(--glass-shadow);
  padding: var(--space-lg);

  /* Smooth transitions */
  transition: all 0.3s ease;
}

.glass-card:hover {
  background: var(--glass-bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 12px 40px var(--glass-shadow);
}

/* Fallback for unsupported browsers */
@supports not (backdrop-filter: blur(10px)) {
  .glass-card {
    background: rgba(255, 255, 255, 0.9);
  }
}
```

### React Components

```tsx
// components/ui/GlassCard.tsx
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
  blur?: 'sm' | 'md' | 'lg';
}

export function GlassCard({
  className,
  variant = 'default',
  blur = 'md',
  children,
  ...props
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-6 transition-all duration-300',
        'bg-white/10 backdrop-blur-md border border-white/20',
        'shadow-lg shadow-black/10',
        'hover:bg-white/15 hover:-translate-y-0.5',
        {
          'shadow-xl': variant === 'elevated',
          'border-2': variant === 'bordered',
          'backdrop-blur-sm': blur === 'sm',
          'backdrop-blur-lg': blur === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

```tsx
// components/ui/GlassButton.tsx
interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function GlassButton({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={cn(
        'rounded-xl font-medium transition-all duration-300',
        'backdrop-blur-sm border border-white/20',
        'hover:scale-105 active:scale-95',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        {
          // Variants
          'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30':
            variant === 'primary',
          'bg-white/10 text-white hover:bg-white/20':
            variant === 'secondary',
          'bg-transparent text-white hover:bg-white/10':
            variant === 'ghost',
          // Sizes
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-base': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

---

## Color Palette

### Primary Colors

```css
/* Brand */
--primary-50: #eef2ff;
--primary-100: #e0e7ff;
--primary-200: #c7d2fe;
--primary-300: #a5b4fc;
--primary-400: #818cf8;
--primary-500: #6366f1;  /* Primary */
--primary-600: #4f46e5;
--primary-700: #4338ca;
--primary-800: #3730a3;
--primary-900: #312e81;
```

### Semantic Colors

```css
/* Success */
--success-50: #ecfdf5;
--success-500: #10b981;
--success-700: #047857;

/* Warning */
--warning-50: #fffbeb;
--warning-500: #f59e0b;
--warning-700: #b45309;

/* Error */
--error-50: #fef2f2;
--error-500: #ef4444;
--error-700: #b91c1c;

/* Info */
--info-50: #eff6ff;
--info-500: #3b82f6;
--info-700: #1d4ed8;
```

### Status Colors for Requests

```css
/* Request Statuses */
--status-new: #6366f1;        /* Indigo */
--status-accepted: #8b5cf6;   /* Violet */
--status-assigned: #3b82f6;   /* Blue */
--status-in-progress: #f59e0b; /* Amber */
--status-completed: #10b981;  /* Green */
--status-closed: #6b7280;     /* Gray */
--status-rejected: #ef4444;   /* Red */
```

---

## Typography

### Font Stack

```css
/* Primary Font */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monospace (for codes, IDs) */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale

```tsx
// Tailwind config
fontSize: {
  'xs': ['12px', { lineHeight: '16px' }],
  'sm': ['14px', { lineHeight: '20px' }],
  'base': ['16px', { lineHeight: '24px' }],
  'lg': ['18px', { lineHeight: '28px' }],
  'xl': ['20px', { lineHeight: '28px' }],
  '2xl': ['24px', { lineHeight: '32px' }],
  '3xl': ['30px', { lineHeight: '36px' }],
  '4xl': ['36px', { lineHeight: '40px' }],
}
```

### Headings

```tsx
// components/ui/Typography.tsx
export function H1({ children, className }: TypographyProps) {
  return (
    <h1 className={cn('text-4xl font-bold tracking-tight', className)}>
      {children}
    </h1>
  );
}

export function H2({ children, className }: TypographyProps) {
  return (
    <h2 className={cn('text-3xl font-semibold tracking-tight', className)}>
      {children}
    </h2>
  );
}

export function H3({ children, className }: TypographyProps) {
  return (
    <h3 className={cn('text-2xl font-semibold', className)}>
      {children}
    </h3>
  );
}
```

---

## Component Library

### Layout Components

```tsx
// Sidebar
<Sidebar>
  <SidebarHeader>
    <Logo />
  </SidebarHeader>
  <SidebarNav>
    <SidebarNavItem icon={<HomeIcon />} href="/">Dashboard</SidebarNavItem>
    <SidebarNavItem icon={<TicketIcon />} href="/requests">Заявки</SidebarNavItem>
    <SidebarNavItem icon={<UsersIcon />} href="/residents">Жители</SidebarNavItem>
    <SidebarNavItem icon={<CreditCardIcon />} href="/payments">Платежи</SidebarNavItem>
    <SidebarNavItem icon={<ChartIcon />} href="/analytics">Аналитика</SidebarNavItem>
  </SidebarNav>
</Sidebar>

// Page Layout
<PageLayout>
  <PageHeader>
    <PageTitle>Заявки</PageTitle>
    <PageActions>
      <GlassButton>Новая заявка</GlassButton>
    </PageActions>
  </PageHeader>
  <PageContent>
    {/* Content */}
  </PageContent>
</PageLayout>
```

### Data Display

```tsx
// Stats Card
<StatsCard
  title="Активные заявки"
  value={128}
  change={+12}
  changeType="increase"
  icon={<TicketIcon />}
/>

// Data Table
<DataTable
  columns={[
    { key: 'id', title: 'ID', sortable: true },
    { key: 'category', title: 'Категория' },
    { key: 'status', title: 'Статус', render: StatusBadge },
    { key: 'created_at', title: 'Дата', format: 'date' },
  ]}
  data={requests}
  onRowClick={(row) => navigate(`/requests/${row.id}`)}
/>

// Kanban Board
<KanbanBoard
  columns={[
    { id: 'new', title: 'Новые', color: 'indigo' },
    { id: 'in_progress', title: 'В работе', color: 'amber' },
    { id: 'completed', title: 'Выполнено', color: 'green' },
  ]}
  items={requests}
  onDragEnd={handleStatusChange}
/>
```

### Forms

```tsx
// Input
<GlassInput
  label="Email"
  type="email"
  placeholder="example@mail.com"
  error={errors.email?.message}
/>

// Select
<GlassSelect
  label="Категория"
  options={categories}
  value={selectedCategory}
  onChange={setSelectedCategory}
/>

// Textarea
<GlassTextarea
  label="Описание"
  placeholder="Опишите проблему..."
  rows={4}
/>

// File Upload
<FileUpload
  accept="image/*"
  multiple
  maxFiles={5}
  onUpload={handleUpload}
/>
```

### Feedback

```tsx
// Toast Notifications
toast.success('Заявка создана');
toast.error('Ошибка при сохранении');
toast.info('Новая заявка #123');

// Modal
<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Назначить исполнителя"
>
  <AssigneeSelect onSelect={handleAssign} />
</Modal>

// Empty State
<EmptyState
  icon={<InboxIcon />}
  title="Нет заявок"
  description="Создайте первую заявку"
  action={<GlassButton>Создать</GlassButton>}
/>
```

---

## Icons

### Рекомендуемые библиотеки

1. **Lucide React** (рекомендуется)
   - Легкая, tree-shakable
   - Consistent стиль
   - 1000+ иконок

```tsx
import { Home, User, Settings, Bell } from 'lucide-react';

<Home className="w-5 h-5" />
```

2. **Heroicons** (альтернатива)
```tsx
import { HomeIcon } from '@heroicons/react/24/outline';
```

### Категории заявок - иконки

```tsx
const CATEGORY_ICONS = {
  plumbing: '🔧',      // или <WrenchIcon />
  electrical: '💡',    // или <LightBulbIcon />
  elevator: '🛗',
  intercom: '🔔',
  cleaning: '🧹',
  heating: '🔥',
  security: '🔒',
  other: '📋',
};
```

---

## Responsive Design

### Breakpoints

```css
/* Tailwind defaults */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Mobile-first approach

```tsx
// Example: Grid that adapts
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <StatsCard />
  <StatsCard />
  <StatsCard />
  <StatsCard />
</div>

// Example: Hide sidebar on mobile
<Sidebar className="hidden lg:flex" />
<MobileNav className="flex lg:hidden" />
```

---

## Accessibility

### WCAG 2.2 Requirements

1. **Contrast Ratio**
   - Normal text: 4.5:1 minimum
   - Large text: 3:1 minimum
   - UI components: 3:1 minimum

2. **Touch Targets**
   - Minimum 44x44px for interactive elements

3. **Keyboard Navigation**
   - All interactive elements focusable
   - Visible focus indicators
   - Logical tab order

### Implementation

```tsx
// Focus visible styles
.focus-visible:ring-2
.focus-visible:ring-primary-500
.focus-visible:ring-offset-2

// Skip link
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to content
</a>

// ARIA labels
<button aria-label="Закрыть модальное окно">
  <XIcon aria-hidden="true" />
</button>

// Reduced motion
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Reduce Transparency Option

```tsx
// Settings for users who prefer less transparency
const { reduceTransparency } = useAccessibilitySettings();

<GlassCard
  className={cn(
    reduceTransparency && 'bg-white dark:bg-gray-900 backdrop-blur-none'
  )}
/>
```

---

## Dark Mode

### Implementation

```tsx
// ThemeProvider
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

// Dark mode classes
.dark .glass-card {
  --glass-bg: rgba(0, 0, 0, 0.3);
  --glass-border: rgba(255, 255, 255, 0.1);
}
```

---

## Animation

### Micro-interactions

```css
/* Hover lift */
.hover-lift {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

/* Button press */
.btn-press:active {
  transform: scale(0.97);
}

/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
```

### Page Transitions

```tsx
import { motion, AnimatePresence } from 'framer-motion';

function PageTransition({ children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```
