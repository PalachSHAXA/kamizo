# Фаза 2: Автоматизация (2-3 месяца)

## Цели фазы

- Автоматизация рутинных операций
- Повышение эффективности работы УК
- Интеграция с внешними системами
- Расширение аналитики

---

## Модуль 2.1: Workflow Builder (3 недели)

### Описание
Визуальный конструктор бизнес-процессов без кода (no-code).

### Функциональность

```
Триггеры:
├── Заявка создана
├── Статус изменен
├── SLA нарушен
├── Платеж получен
├── Показания переданы
└── Расписание (cron)

Условия:
├── Категория заявки == X
├── Приоритет >= Y
├── Сумма задолженности > Z
├── Время суток
└── День недели

Действия:
├── Назначить исполнителя
├── Изменить статус
├── Отправить уведомление
├── Создать задачу
├── Эскалация
└── Webhook (внешний API)
```

### UI компоненты

```jsx
// Drag-and-drop конструктор
<WorkflowBuilder>
  <TriggerBlock type="request_created" />
  <ConditionBlock
    field="category"
    operator="equals"
    value="plumbing"
  />
  <ActionBlock
    type="assign"
    assignee="plumber_group"
  />
  <ActionBlock
    type="notify"
    channel="telegram"
    template="new_assignment"
  />
</WorkflowBuilder>
```

### Backend

```python
# Модель workflow
class Workflow(Base):
    id = Column(UUID)
    company_id = Column(UUID)
    name = Column(String)
    trigger_type = Column(String)
    trigger_config = Column(JSONB)
    conditions = Column(JSONB)  # [{field, operator, value}, ...]
    actions = Column(JSONB)     # [{type, config}, ...]
    is_active = Column(Boolean)

# Executor
class WorkflowExecutor:
    async def execute(self, workflow: Workflow, context: dict):
        if not self.check_conditions(workflow.conditions, context):
            return

        for action in workflow.actions:
            await self.execute_action(action, context)

    async def execute_action(self, action: dict, context: dict):
        action_type = action['type']
        handlers = {
            'assign': self.handle_assign,
            'notify': self.handle_notify,
            'status_change': self.handle_status_change,
            'escalate': self.handle_escalate,
            'webhook': self.handle_webhook,
        }
        await handlers[action_type](action['config'], context)
```

### Deliverables
- Визуальный редактор workflows
- 5+ готовых шаблонов
- Логирование выполнения

---

## Модуль 2.2: Автоматические напоминания (2 недели)

### Напоминания об оплате

```python
# Celery beat schedule
CELERY_BEAT_SCHEDULE = {
    'payment-reminder-7-days': {
        'task': 'tasks.send_payment_reminders',
        'schedule': crontab(hour=10, minute=0),
        'kwargs': {'days_before': 7}
    },
    'payment-overdue-1-day': {
        'task': 'tasks.send_overdue_reminders',
        'schedule': crontab(hour=10, minute=0),
        'kwargs': {'days_overdue': 1}
    },
}

# Task implementation
@celery.task
def send_payment_reminders(days_before: int):
    due_date = date.today() + timedelta(days=days_before)
    apartments = get_apartments_with_due_payments(due_date)

    for apt in apartments:
        resident = get_primary_resident(apt.id)
        if resident.telegram_id:
            send_telegram_reminder(
                telegram_id=resident.telegram_id,
                amount=apt.balance,
                due_date=due_date
            )
```

### Напоминания о показаниях

```python
# Расписание: 20-25 числа каждого месяца
@celery.task
def send_meter_reading_reminders():
    today = date.today()
    if not (20 <= today.day <= 25):
        return

    apartments = get_apartments_without_readings(today.month)
    for apt in apartments:
        notify_resident(apt, 'meter_reading_reminder')
```

### Deliverables
- Настраиваемые напоминания
- История отправок
- Статистика открытий

---

## Модуль 2.3: SLA Dashboard (2 недели)

### Метрики

```
Real-time показатели:
├── Заявки, близкие к нарушению SLA
├── Заявки с нарушенным SLA
├── Среднее время реакции (сегодня/неделя/месяц)
├── Среднее время выполнения
├── % выполнения в срок
└── Рейтинг исполнителей по SLA
```

### Визуализация

```jsx
// SLA Heatmap по дням недели и часам
<SLAHeatmap
  data={slaViolationsByHour}
  colorScale={['green', 'yellow', 'red']}
/>

// Timeline критичных заявок
<CriticalRequestsTimeline
  requests={requestsNearSLA}
  threshold={30} // минут до нарушения
/>

// Исполнители с худшим SLA
<PerformanceTable
  data={staffPerformance}
  sortBy="sla_violation_rate"
  order="desc"
/>
```

### Алерты

```python
# Webhook для мониторинга
@celery.task
def check_sla_violations():
    critical = get_requests_near_sla_violation(minutes=30)

    for request in critical:
        # Telegram уведомление руководителю
        notify_manager(
            request=request,
            time_remaining=request.sla_remaining_minutes
        )

        # Автоэскалация если настроено
        if request.company.auto_escalate:
            escalate_request(request)
```

### Deliverables
- Real-time SLA dashboard
- Автоматические алерты
- Отчет по SLA за период

---

## Модуль 2.4: Аналитические дашборды (3 недели)

### Дашборд руководителя

```
Виджеты:
├── KPI карточки (заявки, платежи, оценки)
├── Тренд заявок (line chart)
├── Распределение по категориям (pie chart)
├── Топ проблемных домов (bar chart)
├── Финансовый баланс (area chart)
└── Активность персонала (table)
```

### Дашборд диспетчера

```
Виджеты:
├── Заявки на сегодня
├── Просроченные заявки
├── Загрузка исполнителей
├── Карта заявок (если есть геолокация)
└── Быстрые действия
```

### Конструктор отчетов

```python
# API для кастомных отчетов
@router.post("/reports/custom")
async def generate_custom_report(
    report_config: ReportConfig,
    current_user: User = Depends(get_current_user)
):
    """
    report_config = {
        "entity": "requests",
        "metrics": ["count", "avg_resolution_time"],
        "dimensions": ["category", "building"],
        "filters": {"status": "completed"},
        "date_range": {"from": "2024-01-01", "to": "2024-01-31"},
        "format": "excel"  # or "pdf", "json"
    }
    """
    data = await analytics_service.generate_report(report_config)
    return export_report(data, report_config.format)
```

### Deliverables
- 3 готовых дашборда
- Конструктор отчетов
- Экспорт в Excel/PDF
- Scheduled reports (email)

---

## Модуль 2.5: Интеграция с 1С (3 недели)

### Сценарии интеграции

```
UK CRM → 1С:
├── Платежи (после подтверждения)
├── Начисления
└── Показания счетчиков

1С → UK CRM:
├── Справочник услуг и тарифов
├── Сальдо по лицевым счетам
└── Квитанции (PDF)
```

### Архитектура

```
┌─────────────┐     REST/SOAP     ┌─────────────┐
│   UK CRM    │ ◄───────────────► │ 1C Exchange │
│   Backend   │                   │   Service   │
└─────────────┘                   └──────┬──────┘
                                         │
                                    COM/HTTP
                                         │
                                  ┌──────┴──────┐
                                  │   1С:ЖКХ    │
                                  └─────────────┘
```

### API Endpoints

```python
# Экспорт платежей в 1С
@router.post("/integrations/1c/payments/export")
async def export_payments_to_1c(
    date_from: date,
    date_to: date
):
    payments = await payment_service.get_completed_payments(date_from, date_to)
    return format_for_1c(payments)

# Импорт тарифов из 1С
@router.post("/integrations/1c/tariffs/import")
async def import_tariffs_from_1c(
    tariffs: List[Tariff1CSchema]
):
    await tariff_service.bulk_update(tariffs)
    return {"imported": len(tariffs)}

# Webhook для обновления сальдо
@router.post("/integrations/1c/webhook/balance")
async def update_balance_from_1c(
    data: BalanceUpdate1CSchema
):
    await apartment_service.update_balance(
        account_number=data.account,
        balance=data.balance
    )
```

### Deliverables
- REST API для обмена данными
- Документация интеграции
- Тестирование с реальной 1С

---

## Модуль 2.6: Push уведомления (1 неделя)

### Firebase Cloud Messaging

```python
# Firebase Admin SDK
import firebase_admin
from firebase_admin import messaging

def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: dict = None
):
    message = messaging.Message(
        notification=messaging.Notification(
            title=title,
            body=body,
        ),
        data=data or {},
        token=token,
    )
    return messaging.send(message)

# Групповая рассылка
def send_multicast(tokens: List[str], title: str, body: str):
    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        tokens=tokens,
    )
    response = messaging.send_multicast(message)
    return {
        "success": response.success_count,
        "failure": response.failure_count
    }
```

### Token Management

```python
# Модель для хранения токенов
class PushToken(Base):
    id = Column(Integer)
    user_id = Column(UUID)
    token = Column(String)
    platform = Column(String)  # ios, android, web
    is_active = Column(Boolean)
    created_at = Column(DateTime)
    last_used = Column(DateTime)

# Обновление токена
@router.post("/users/me/push-token")
async def update_push_token(
    token_data: PushTokenCreate,
    current_user: User = Depends(get_current_user)
):
    await push_service.upsert_token(
        user_id=current_user.id,
        token=token_data.token,
        platform=token_data.platform
    )
```

### Deliverables
- Push уведомления работают на всех платформах
- Управление подписками
- Аналитика доставки

---

## Timeline Фазы 2

```
Неделя 1-3:   Workflow Builder
Неделя 4-5:   Автоматические напоминания
Неделя 6-7:   SLA Dashboard
Неделя 8-10:  Аналитические дашборды
Неделя 11-13: Интеграция 1С
Неделя 14:    Push уведомления + тестирование
```

---

## Метрики успеха Фазы 2

- Время обработки заявки сократилось на 30%
- Собираемость платежей выросла на 15%
- 80% заявок обрабатываются через workflows
- Руководители используют дашборды ежедневно
