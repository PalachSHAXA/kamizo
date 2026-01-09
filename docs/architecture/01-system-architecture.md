# Системная архитектура UK CRM

## Обзор архитектуры

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              КЛИЕНТЫ                                        │
├─────────────────┬─────────────────┬──────────────────┬─────────────────────┤
│   Web Admin     │   Mobile App    │   Mobile App     │   Telegram Bot      │
│   (React)       │   (Resident)    │   (Staff)        │   (aiogram)         │
│   Desktop-first │   PWA/RN        │   PWA/RN         │                     │
└────────┬────────┴────────┬────────┴────────┬─────────┴──────────┬──────────┘
         │                 │                 │                    │
         └─────────────────┴─────────────────┴────────────────────┘
                                    │
                              HTTPS/WSS
                                    │
┌───────────────────────────────────┴───────────────────────────────────────┐
│                           API GATEWAY                                      │
│                         (Nginx / Traefik)                                  │
│                    Load Balancing, SSL, Rate Limiting                      │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴───────────────────────────────────────┐
│                          BACKEND SERVICES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   Main API       │  │   Telegram Bot   │  │   Notification   │         │
│  │   (FastAPI)      │  │   Service        │  │   Service        │         │
│  │                  │  │   (aiogram)      │  │   (Celery)       │         │
│  │  - Auth          │  │                  │  │                  │         │
│  │  - Requests      │  │  - Webhook       │  │  - Push          │         │
│  │  - Payments      │  │  - Commands      │  │  - Email         │         │
│  │  - Residents     │  │  - FSM           │  │  - SMS           │         │
│  │  - Reports       │  │                  │  │                  │         │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘         │
│           │                     │                     │                    │
│           └─────────────────────┴─────────────────────┘                    │
│                                 │                                          │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴──────────────────────────────────────────┐
│                            DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PostgreSQL  │  │    Redis    │  │    MinIO    │  │   RabbitMQ  │        │
│  │             │  │             │  │             │  │             │        │
│  │ - Users     │  │ - Sessions  │  │ - Photos    │  │ - Tasks     │        │
│  │ - Requests  │  │ - Cache     │  │ - Documents │  │ - Events    │        │
│  │ - Payments  │  │ - FSM State │  │ - Reports   │  │             │        │
│  │ - Analytics │  │ - Pub/Sub   │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────┴──────────────────────────────────────────┐
│                        EXTERNAL SERVICES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Payme     │  │    Click    │  │  Telegram   │  │   Firebase  │        │
│  │   API       │  │    API      │  │   Bot API   │  │   FCM       │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Компоненты системы

### 1. Frontend Applications

#### Web Admin Panel (React + TypeScript)

```
Технологии:
- React 18 + TypeScript
- Vite для сборки
- TanStack Query для data fetching
- Zustand для state management
- React Router v6
- Tailwind CSS + Glassmorphism
- React Hook Form + Zod
- Chart.js для графиков
```

#### Mobile Apps (React Native / PWA)

```
Вариант 1: PWA (для MVP)
- Vite PWA Plugin
- Workbox для offline
- Web Push API

Вариант 2: React Native (для продакшена)
- Expo для быстрого старта
- React Navigation
- AsyncStorage для offline
- Firebase для push
```

### 2. Backend Services

#### Main API (FastAPI + Python)

```python
# Структура проекта
src/
├── api/
│   ├── v1/
│   │   ├── auth.py
│   │   ├── requests.py
│   │   ├── residents.py
│   │   ├── payments.py
│   │   ├── meters.py
│   │   └── reports.py
│   └── deps.py
├── core/
│   ├── config.py
│   ├── security.py
│   └── exceptions.py
├── models/
│   ├── user.py
│   ├── request.py
│   ├── resident.py
│   └── payment.py
├── schemas/
│   ├── user.py
│   ├── request.py
│   └── payment.py
├── services/
│   ├── request_service.py
│   ├── payment_service.py
│   └── notification_service.py
├── repositories/
│   ├── base.py
│   ├── request_repo.py
│   └── resident_repo.py
└── main.py
```

#### Telegram Bot Service

```
Отдельный сервис для масштабирования
- aiogram 3.x
- Redis FSM Storage
- Webhook mode
```

#### Notification Service (Celery)

```
Асинхронная обработка:
- Push уведомления (FCM)
- Email рассылки
- SMS (при необходимости)
- Scheduled tasks (напоминания)
```

### 3. Data Layer

#### PostgreSQL

```sql
-- Основные таблицы
- users (админы, диспетчеры)
- residents (жители)
- apartments (квартиры)
- buildings (дома)
- complexes (ЖК)
- requests (заявки)
- request_history (история изменений)
- payments (платежи)
- meter_readings (показания)
- notifications (уведомления)
```

#### Redis

```
Использование:
- Сессии пользователей
- Кэширование часто запрашиваемых данных
- FSM состояния Telegram бота
- Rate limiting
- Pub/Sub для real-time обновлений
```

#### MinIO (S3-compatible)

```
Хранение файлов:
- Фото к заявкам
- Документы жителей
- Отчеты PDF/Excel
- Аватары пользователей
```

#### RabbitMQ

```
Очереди задач:
- Отправка уведомлений
- Генерация отчетов
- Обработка платежей
- Email рассылки
```

---

## API Design

### RESTful API Endpoints

```yaml
# Auth
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Requests (Заявки)
GET    /api/v1/requests
POST   /api/v1/requests
GET    /api/v1/requests/{id}
PATCH  /api/v1/requests/{id}
POST   /api/v1/requests/{id}/assign
POST   /api/v1/requests/{id}/complete
POST   /api/v1/requests/{id}/rate

# Residents (Жители)
GET    /api/v1/residents
POST   /api/v1/residents
GET    /api/v1/residents/{id}
PATCH  /api/v1/residents/{id}

# Payments (Платежи)
GET    /api/v1/payments
POST   /api/v1/payments/create
GET    /api/v1/payments/{id}
POST   /api/v1/payments/webhook/payme
POST   /api/v1/payments/webhook/click

# Meters (Показания)
GET    /api/v1/meters
POST   /api/v1/meters/readings
GET    /api/v1/meters/{id}/history

# Buildings (Дома)
GET    /api/v1/buildings
POST   /api/v1/buildings
GET    /api/v1/buildings/{id}

# Reports (Отчеты)
GET    /api/v1/reports/requests
GET    /api/v1/reports/payments
GET    /api/v1/reports/performance

# Notifications
POST   /api/v1/notifications/send
GET    /api/v1/notifications/templates
```

### WebSocket Events

```javascript
// Real-time обновления
{
  "type": "request.created",
  "data": { "request_id": 123, ... }
}

{
  "type": "request.status_changed",
  "data": { "request_id": 123, "status": "in_progress" }
}

{
  "type": "payment.completed",
  "data": { "payment_id": 456, "amount": 50000 }
}
```

---

## Security

### Authentication

```python
# JWT Token Structure
{
  "sub": "user_id",
  "role": "admin|dispatcher|staff|resident",
  "company_id": "uuid",
  "exp": timestamp,
  "iat": timestamp
}

# Роли и права
ROLES = {
    "super_admin": ["*"],
    "admin": ["requests.*", "residents.*", "reports.read", "settings.*"],
    "dispatcher": ["requests.*", "residents.read"],
    "staff": ["requests.read", "requests.update_own"],
    "resident": ["requests.create", "requests.read_own", "payments.*"]
}
```

### Data Protection

```python
# Шифрование чувствительных данных
from cryptography.fernet import Fernet

class DataEncryption:
    def __init__(self, key: str):
        self.cipher = Fernet(key)

    def encrypt(self, data: str) -> str:
        return self.cipher.encrypt(data.encode()).decode()

    def decrypt(self, encrypted: str) -> str:
        return self.cipher.decrypt(encrypted.encode()).decode()

# Хеширование паролей
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
```

### Rate Limiting

```python
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

# Настройка лимитов
@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")
async def login():
    pass

# Глобальные лимиты
# - Auth endpoints: 5 req/min
# - API endpoints: 100 req/min
# - Webhooks: 1000 req/min
```

---

## Deployment

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  api:
    build: ./src/backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/uk_crm
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  telegram-bot:
    build: ./src/telegram-bot
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - API_BASE_URL=http://api:8000
    depends_on:
      - api
      - redis

  celery:
    build: ./src/backend
    command: celery -A app.worker worker -l info
    depends_on:
      - rabbitmq
      - redis

  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=uk_crm
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:7-alpine

  rabbitmq:
    image: rabbitmq:3-management

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  postgres_data:
  minio_data:
```

### Production (Kubernetes готовность)

```
Рекомендации для production:
- Managed PostgreSQL (или реплицированный)
- Redis Cluster
- MinIO в кластерном режиме
- Горизонтальное масштабирование API
- CDN для статики
- Мониторинг (Prometheus + Grafana)
- Логирование (ELK Stack)
```

---

## Масштабирование

### Горизонтальное масштабирование

```
API Servers: Load balancer распределяет запросы
Celery Workers: Можно добавлять воркеры
Telegram Bot: Webhook mode, без состояния
PostgreSQL: Read replicas для отчетов
Redis: Cluster mode
```

### Вертикальное масштабирование

```
Начальные ресурсы (до 1000 квартир):
- API: 2 CPU, 4GB RAM
- DB: 2 CPU, 4GB RAM
- Redis: 1 CPU, 2GB RAM

Расширенные (до 10000 квартир):
- API: 4 CPU, 8GB RAM (2 инстанса)
- DB: 4 CPU, 16GB RAM
- Redis: 2 CPU, 4GB RAM
```
