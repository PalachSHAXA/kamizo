# Database Schema - UK CRM

## ERD Overview

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    companies    │───┐   │    complexes    │───┐   │    buildings    │
│                 │   │   │                 │   │   │                 │
│ id              │   └──▶│ company_id      │   └──▶│ complex_id      │
│ name            │       │ name            │       │ address         │
│ settings        │       │ address         │       │ entrances       │
└─────────────────┘       └─────────────────┘       └────────┬────────┘
                                                              │
                          ┌───────────────────────────────────┘
                          │
                          ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   apartments    │◀──────│    residents    │───────│      users      │
│                 │       │                 │       │                 │
│ building_id     │       │ apartment_id    │       │ resident_id     │
│ number          │       │ full_name       │       │ telegram_id     │
│ area            │       │ phone           │       │ role            │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    payments     │       │    requests     │◀──────│ request_history │
│                 │       │                 │       │                 │
│ apartment_id    │       │ resident_id     │       │ request_id      │
│ amount          │       │ category        │       │ status          │
│ status          │       │ status          │       │ changed_by      │
└─────────────────┘       │ assignee_id     │       └─────────────────┘
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ request_photos  │
                          │                 │
                          │ request_id      │
                          │ file_path       │
                          └─────────────────┘
```

## SQL Schema

### Core Tables

```sql
-- Управляющие компании
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    inn VARCHAR(20),
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    logo_url VARCHAR(500),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Жилые комплексы
CREATE TABLE complexes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    total_buildings INTEGER DEFAULT 0,
    total_apartments INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Дома
CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complex_id UUID NOT NULL REFERENCES complexes(id),
    address VARCHAR(500) NOT NULL,
    name VARCHAR(100), -- "Дом 1", "Корпус А"
    entrances INTEGER DEFAULT 1,
    floors INTEGER,
    apartments_count INTEGER DEFAULT 0,
    year_built INTEGER,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Квартиры / Лицевые счета
CREATE TABLE apartments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL REFERENCES buildings(id),
    number VARCHAR(20) NOT NULL,
    entrance INTEGER,
    floor INTEGER,
    area DECIMAL(8, 2), -- площадь в м²
    rooms INTEGER,
    account_number VARCHAR(50) UNIQUE, -- лицевой счет
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(building_id, number)
);

-- Жители
CREATE TABLE residents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    is_owner BOOLEAN DEFAULT false, -- собственник или арендатор
    is_primary BOOLEAN DEFAULT false, -- основной контакт
    passport_series VARCHAR(10),
    passport_number VARCHAR(20),
    birth_date DATE,
    move_in_date DATE,
    move_out_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_residents_phone ON residents(phone);
CREATE INDEX idx_residents_apartment ON residents(apartment_id);
```

### Users & Auth

```sql
-- Пользователи системы
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    resident_id UUID REFERENCES residents(id), -- для жителей
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- super_admin, admin, dispatcher, staff, resident
    telegram_id BIGINT UNIQUE,
    telegram_username VARCHAR(100),
    avatar_url VARCHAR(500),
    language VARCHAR(10) DEFAULT 'ru',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_role CHECK (role IN ('super_admin', 'admin', 'dispatcher', 'staff', 'resident'))
);

CREATE INDEX idx_users_telegram ON users(telegram_id);
CREATE INDEX idx_users_company ON users(company_id);

-- Сессии
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    refresh_token VARCHAR(500) NOT NULL,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Разрешения (для кастомных ролей)
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE role_permissions (
    role VARCHAR(50) NOT NULL,
    permission_id INTEGER REFERENCES permissions(id),
    PRIMARY KEY (role, permission_id)
);
```

### Requests (Заявки)

```sql
-- Категории заявок
CREATE TABLE request_categories (
    id SERIAL PRIMARY KEY,
    company_id UUID REFERENCES companies(id), -- NULL = глобальная
    code VARCHAR(50) NOT NULL,
    name_ru VARCHAR(100) NOT NULL,
    name_uz VARCHAR(100),
    icon VARCHAR(50),
    color VARCHAR(20),
    sla_response_minutes INTEGER DEFAULT 240, -- 4 часа
    sla_resolve_minutes INTEGER DEFAULT 4320, -- 72 часа
    priority INTEGER DEFAULT 2, -- 1=авария, 2=срочная, 3=обычная, 4=плановая
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0
);

-- Заявки
CREATE TABLE requests (
    id SERIAL PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    building_id UUID NOT NULL REFERENCES buildings(id),
    apartment_id UUID REFERENCES apartments(id),
    resident_id UUID REFERENCES residents(id),
    created_by_user_id UUID REFERENCES users(id),

    -- Содержание
    category_id INTEGER REFERENCES request_categories(id),
    title VARCHAR(255),
    description TEXT NOT NULL,
    priority INTEGER DEFAULT 3, -- 1=критический, 2=высокий, 3=средний, 4=низкий

    -- Статус
    status VARCHAR(50) DEFAULT 'new',
    -- new, accepted, assigned, in_progress, completed, closed, rejected

    -- Исполнение
    assignee_id UUID REFERENCES users(id),
    assigned_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    closed_at TIMESTAMP,

    -- SLA
    sla_response_deadline TIMESTAMP,
    sla_resolve_deadline TIMESTAMP,
    sla_response_met BOOLEAN,
    sla_resolve_met BOOLEAN,

    -- Оценка
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    rating_comment TEXT,
    rated_at TIMESTAMP,

    -- Мета
    source VARCHAR(50) DEFAULT 'telegram', -- telegram, web, phone, mobile
    is_recurring BOOLEAN DEFAULT false,
    parent_request_id INTEGER REFERENCES requests(id),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_requests_company ON requests(company_id);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_assignee ON requests(assignee_id);
CREATE INDEX idx_requests_building ON requests(building_id);
CREATE INDEX idx_requests_created ON requests(created_at DESC);

-- История изменений заявки
CREATE TABLE request_history (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- created, status_changed, assigned, commented, rated
    old_value JSONB,
    new_value JSONB,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_request_history_request ON request_history(request_id);

-- Фото к заявкам
CREATE TABLE request_photos (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    type VARCHAR(20) DEFAULT 'problem', -- problem, solution
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Комментарии к заявкам
CREATE TABLE request_comments (
    id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id),
    user_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false, -- внутренний комментарий (не виден жителю)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Payments

```sql
-- Виды услуг
CREATE TABLE service_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ru VARCHAR(100) NOT NULL,
    name_uz VARCHAR(100),
    unit VARCHAR(20), -- м², м³, кВт·ч
    is_metered BOOLEAN DEFAULT false, -- по счетчику
    is_active BOOLEAN DEFAULT true
);

-- Тарифы
CREATE TABLE tariffs (
    id SERIAL PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    complex_id UUID REFERENCES complexes(id), -- NULL = для всей компании
    service_type_id INTEGER NOT NULL REFERENCES service_types(id),
    price DECIMAL(12, 2) NOT NULL,
    unit VARCHAR(20),
    valid_from DATE NOT NULL,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Начисления
CREATE TABLE charges (
    id SERIAL PRIMARY KEY,
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    service_type_id INTEGER NOT NULL REFERENCES service_types(id),
    period DATE NOT NULL, -- первый день месяца
    quantity DECIMAL(12, 4),
    tariff_id INTEGER REFERENCES tariffs(id),
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(apartment_id, service_type_id, period)
);

CREATE INDEX idx_charges_apartment ON charges(apartment_id);
CREATE INDEX idx_charges_period ON charges(period);

-- Платежи
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    resident_id UUID REFERENCES residents(id),

    -- Сумма
    amount DECIMAL(12, 2) NOT NULL,
    commission DECIMAL(12, 2) DEFAULT 0,

    -- Провайдер
    provider VARCHAR(20) NOT NULL, -- payme, click
    external_id VARCHAR(100), -- ID в платежной системе
    provider_data JSONB,

    -- Статус
    status VARCHAR(50) DEFAULT 'pending',
    -- pending, processing, completed, cancelled, failed

    -- Детали
    purpose TEXT, -- за что оплата
    period DATE, -- период оплаты

    -- Ошибки
    error_code VARCHAR(50),
    error_message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_payments_apartment ON payments(apartment_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_external ON payments(provider, external_id);

-- Баланс квартиры (денормализованная таблица для быстрого доступа)
CREATE TABLE apartment_balances (
    apartment_id UUID PRIMARY KEY REFERENCES apartments(id),
    total_charged DECIMAL(14, 2) DEFAULT 0,
    total_paid DECIMAL(14, 2) DEFAULT 0,
    balance DECIMAL(14, 2) GENERATED ALWAYS AS (total_paid - total_charged) STORED,
    last_payment_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Автоплатежи
CREATE TABLE recurring_payments (
    id SERIAL PRIMARY KEY,
    resident_id UUID NOT NULL REFERENCES residents(id),
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    provider VARCHAR(20) NOT NULL,
    card_token VARCHAR(255) NOT NULL,
    card_last_four VARCHAR(4),
    is_active BOOLEAN DEFAULT true,
    day_of_month INTEGER DEFAULT 1, -- день списания
    max_amount DECIMAL(12, 2), -- лимит
    last_charge_date DATE,
    next_charge_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Meters (Счетчики)

```sql
-- Типы счетчиков
CREATE TABLE meter_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_ru VARCHAR(100) NOT NULL,
    name_uz VARCHAR(100),
    unit VARCHAR(20) NOT NULL, -- м³, кВт·ч
    service_type_id INTEGER REFERENCES service_types(id),
    is_active BOOLEAN DEFAULT true
);

-- Счетчики
CREATE TABLE meters (
    id SERIAL PRIMARY KEY,
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    meter_type_id INTEGER NOT NULL REFERENCES meter_types(id),
    serial_number VARCHAR(50),
    installation_date DATE,
    verification_date DATE, -- дата поверки
    next_verification_date DATE,
    initial_value DECIMAL(12, 4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_meters_apartment ON meters(apartment_id);

-- Показания счетчиков
CREATE TABLE meter_readings (
    id SERIAL PRIMARY KEY,
    meter_id INTEGER NOT NULL REFERENCES meters(id),
    apartment_id UUID NOT NULL REFERENCES apartments(id),
    value DECIMAL(12, 4) NOT NULL,
    previous_value DECIMAL(12, 4),
    consumption DECIMAL(12, 4) GENERATED ALWAYS AS (value - COALESCE(previous_value, 0)) STORED,
    period DATE NOT NULL, -- первый день месяца
    source VARCHAR(20) DEFAULT 'manual', -- manual, telegram, auto (IoT)
    submitted_by UUID REFERENCES users(id),
    photo_url VARCHAR(500),
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(meter_id, period)
);

CREATE INDEX idx_readings_meter ON meter_readings(meter_id);
CREATE INDEX idx_readings_period ON meter_readings(period);
```

### Notifications

```sql
-- Шаблоны уведомлений
CREATE TABLE notification_templates (
    id SERIAL PRIMARY KEY,
    company_id UUID REFERENCES companies(id),
    code VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL, -- push, telegram, email, sms
    title_ru VARCHAR(255),
    title_uz VARCHAR(255),
    body_ru TEXT NOT NULL,
    body_uz TEXT,
    variables JSONB, -- список доступных переменных
    is_active BOOLEAN DEFAULT true,

    UNIQUE(company_id, code, channel)
);

-- Уведомления
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    resident_id UUID REFERENCES residents(id),
    template_id INTEGER REFERENCES notification_templates(id),
    channel VARCHAR(20) NOT NULL,
    title VARCHAR(255),
    body TEXT NOT NULL,
    data JSONB, -- дополнительные данные
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);

-- Новости и объявления
CREATE TABLE news (
    id SERIAL PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    complex_id UUID REFERENCES complexes(id),
    building_id UUID REFERENCES buildings(id),
    title_ru VARCHAR(255) NOT NULL,
    title_uz VARCHAR(255),
    content_ru TEXT NOT NULL,
    content_uz TEXT,
    image_url VARCHAR(500),
    is_important BOOLEAN DEFAULT false,
    publish_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_news_company ON news(company_id);
CREATE INDEX idx_news_publish ON news(publish_at DESC);
```

### Analytics & Logs

```sql
-- Аналитика заявок (агрегированные данные)
CREATE TABLE request_analytics_daily (
    id SERIAL PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id),
    date DATE NOT NULL,
    total_created INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    total_rejected INTEGER DEFAULT 0,
    avg_resolution_minutes INTEGER,
    sla_met_count INTEGER DEFAULT 0,
    sla_violated_count INTEGER DEFAULT 0,
    avg_rating DECIMAL(3, 2),
    by_category JSONB, -- {category_id: count, ...}
    by_building JSONB,

    UNIQUE(company_id, date)
);

-- Логи действий
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

## Migrations

Рекомендуемый инструмент: **Alembic** (для FastAPI/SQLAlchemy)

```bash
# Инициализация
alembic init migrations

# Создание миграции
alembic revision --autogenerate -m "Initial schema"

# Применение миграций
alembic upgrade head

# Откат
alembic downgrade -1
```

## Indexes Summary

```sql
-- Производительность критичные индексы
CREATE INDEX idx_requests_company_status ON requests(company_id, status);
CREATE INDEX idx_requests_company_created ON requests(company_id, created_at DESC);
CREATE INDEX idx_payments_apartment_period ON payments(apartment_id, period);
CREATE INDEX idx_readings_apartment_period ON meter_readings(apartment_id, period);

-- Full-text search для заявок
CREATE INDEX idx_requests_search ON requests USING gin(to_tsvector('russian', description));
```
