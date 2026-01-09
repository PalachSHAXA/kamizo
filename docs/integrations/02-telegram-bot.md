# Telegram Bot Integration

## Статистика рынка

- **18 миллионов** пользователей Telegram в Узбекистане
- **70-80%** населения предпочитают Telegram
- **2 место в мире** по количеству Telegram-каналов

## Архитектура бота

### Webhook vs Long Polling

**Рекомендация:** Webhook для продакшена

**Преимущества:**
- Мгновенная доставка обновлений
- Меньше нагрузки на сервер
- Масштабируемость

**Требования:**
- HTTPS с валидным SSL
- Публичный IP или домен
- Порт 443, 80, 88 или 8443

### Структура проекта

```
telegram-bot/
├── bot/
│   ├── __init__.py
│   ├── main.py              # Точка входа
│   ├── config.py            # Конфигурация
│   ├── handlers/
│   │   ├── __init__.py
│   │   ├── start.py         # /start, регистрация
│   │   ├── requests.py      # Заявки
│   │   ├── payments.py      # Платежи
│   │   ├── meters.py        # Показания счетчиков
│   │   ├── profile.py       # Профиль
│   │   └── admin.py         # Админ команды
│   ├── keyboards/
│   │   ├── __init__.py
│   │   ├── main_menu.py
│   │   ├── request_kb.py
│   │   └── inline_kb.py
│   ├── states/
│   │   ├── __init__.py
│   │   ├── registration.py
│   │   └── new_request.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── api_client.py    # Клиент к основному API
│   │   └── notifications.py # Отправка уведомлений
│   ├── middlewares/
│   │   ├── __init__.py
│   │   ├── auth.py          # Проверка авторизации
│   │   └── i18n.py          # Мультиязычность
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
├── locales/                  # Переводы
│   ├── uz/
│   ├── ru/
│   └── uz_cyrl/
├── requirements.txt
└── Dockerfile
```

## Реализация на aiogram 3.x

### Конфигурация

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    BOT_TOKEN: str
    API_BASE_URL: str
    WEBHOOK_URL: str
    WEBHOOK_SECRET: str

    # Database
    DATABASE_URL: str

    # Redis for FSM
    REDIS_URL: str

    class Config:
        env_file = ".env"

settings = Settings()
```

### Основной файл

```python
# main.py
import asyncio
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from config import settings
from handlers import start, requests, payments, meters, profile
from middlewares.i18n import I18nMiddleware

async def on_startup(bot: Bot):
    await bot.set_webhook(
        settings.WEBHOOK_URL,
        secret_token=settings.WEBHOOK_SECRET
    )

async def on_shutdown(bot: Bot):
    await bot.delete_webhook()

def main():
    bot = Bot(token=settings.BOT_TOKEN)
    storage = RedisStorage.from_url(settings.REDIS_URL)
    dp = Dispatcher(storage=storage)

    # Middleware
    dp.message.middleware(I18nMiddleware())

    # Routers
    dp.include_router(start.router)
    dp.include_router(requests.router)
    dp.include_router(payments.router)
    dp.include_router(meters.router)
    dp.include_router(profile.router)

    # Webhook
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    app = web.Application()
    webhook_handler = SimpleRequestHandler(
        dispatcher=dp,
        bot=bot,
        secret_token=settings.WEBHOOK_SECRET
    )
    webhook_handler.register(app, path="/webhook")
    setup_application(app, dp, bot=bot)

    web.run_app(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()
```

### Регистрация пользователя

```python
# handlers/start.py
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

router = Router()

class Registration(StatesGroup):
    phone = State()
    apartment = State()
    confirmation = State()

@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext):
    # Проверяем, зарегистрирован ли пользователь
    user = await get_user(message.from_user.id)

    if user:
        await message.answer(
            "Добро пожаловать! Выберите действие:",
            reply_markup=main_menu_keyboard()
        )
    else:
        await message.answer(
            "Добро пожаловать в систему УК!\n"
            "Для регистрации отправьте ваш номер телефона:",
            reply_markup=phone_request_keyboard()
        )
        await state.set_state(Registration.phone)

@router.message(Registration.phone, F.contact)
async def process_phone(message: Message, state: FSMContext):
    phone = message.contact.phone_number
    await state.update_data(phone=phone)

    # Ищем жителя по номеру телефона
    resident = await api_client.find_resident(phone)

    if resident:
        await state.update_data(resident_id=resident['id'])
        await message.answer(
            f"Найдена квартира: {resident['address']}\n"
            "Подтвердите регистрацию:",
            reply_markup=confirm_keyboard()
        )
        await state.set_state(Registration.confirmation)
    else:
        await message.answer(
            "Номер телефона не найден в системе.\n"
            "Обратитесь в вашу управляющую компанию."
        )
        await state.clear()

@router.callback_query(Registration.confirmation, F.data == "confirm")
async def confirm_registration(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()

    # Привязываем Telegram к жителю
    await api_client.link_telegram(
        resident_id=data['resident_id'],
        telegram_id=callback.from_user.id,
        username=callback.from_user.username
    )

    await callback.message.answer(
        "Регистрация завершена!\n"
        "Теперь вы можете:\n"
        "• Подавать заявки\n"
        "• Оплачивать услуги\n"
        "• Передавать показания",
        reply_markup=main_menu_keyboard()
    )
    await state.clear()
```

### Создание заявки

```python
# handlers/requests.py
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup

router = Router()

class NewRequest(StatesGroup):
    category = State()
    description = State()
    photo = State()
    confirmation = State()

# Категории заявок
CATEGORIES = {
    "plumbing": {"name": "Сантехника", "icon": "🔧"},
    "electrical": {"name": "Электрика", "icon": "💡"},
    "elevator": {"name": "Лифт", "icon": "🛗"},
    "intercom": {"name": "Домофон", "icon": "🔔"},
    "cleaning": {"name": "Уборка", "icon": "🧹"},
    "other": {"name": "Другое", "icon": "📋"}
}

@router.callback_query(F.data == "new_request")
async def start_new_request(callback: CallbackQuery, state: FSMContext):
    await callback.message.answer(
        "Выберите категорию проблемы:",
        reply_markup=categories_keyboard()
    )
    await state.set_state(NewRequest.category)

@router.callback_query(NewRequest.category, F.data.startswith("cat_"))
async def process_category(callback: CallbackQuery, state: FSMContext):
    category = callback.data.replace("cat_", "")
    await state.update_data(category=category)

    await callback.message.answer(
        f"Категория: {CATEGORIES[category]['icon']} {CATEGORIES[category]['name']}\n\n"
        "Опишите проблему текстом или отправьте голосовое сообщение:"
    )
    await state.set_state(NewRequest.description)

@router.message(NewRequest.description)
async def process_description(message: Message, state: FSMContext):
    if message.text:
        description = message.text
    elif message.voice:
        # Сохраняем voice для транскрипции
        description = f"[Голосовое сообщение: {message.voice.file_id}]"
    else:
        await message.answer("Пожалуйста, отправьте текст или голосовое сообщение")
        return

    await state.update_data(description=description)

    await message.answer(
        "Отправьте фото проблемы (до 5 шт.)\n"
        "или нажмите 'Пропустить':",
        reply_markup=skip_keyboard()
    )
    await state.update_data(photos=[])
    await state.set_state(NewRequest.photo)

@router.message(NewRequest.photo, F.photo)
async def process_photo(message: Message, state: FSMContext):
    data = await state.get_data()
    photos = data.get('photos', [])

    # Берем фото максимального размера
    photo = message.photo[-1]
    photos.append(photo.file_id)

    if len(photos) >= 5:
        await finish_photos(message, state, photos)
    else:
        await state.update_data(photos=photos)
        await message.answer(
            f"Фото добавлено ({len(photos)}/5)\n"
            "Добавьте еще или нажмите 'Готово':",
            reply_markup=done_keyboard()
        )

@router.callback_query(NewRequest.photo, F.data.in_(["skip", "done"]))
async def finish_photos(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()

    # Формируем превью заявки
    category = CATEGORIES[data['category']]
    preview = (
        f"📋 *Новая заявка*\n\n"
        f"Категория: {category['icon']} {category['name']}\n"
        f"Описание: {data['description']}\n"
        f"Фото: {len(data.get('photos', []))} шт.\n\n"
        "Отправить заявку?"
    )

    await callback.message.answer(
        preview,
        parse_mode="Markdown",
        reply_markup=confirm_request_keyboard()
    )
    await state.set_state(NewRequest.confirmation)

@router.callback_query(NewRequest.confirmation, F.data == "submit")
async def submit_request(callback: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    user = await get_user(callback.from_user.id)

    # Отправляем заявку в API
    request = await api_client.create_request(
        resident_id=user['resident_id'],
        category=data['category'],
        description=data['description'],
        photos=data.get('photos', [])
    )

    await callback.message.answer(
        f"✅ Заявка #{request['id']} создана!\n\n"
        f"Статус: Новая\n"
        f"Вы получите уведомление при изменении статуса.",
        reply_markup=main_menu_keyboard()
    )
    await state.clear()
```

### Система уведомлений

```python
# services/notifications.py
from aiogram import Bot
from typing import List, Optional

class NotificationService:
    def __init__(self, bot: Bot):
        self.bot = bot

    async def notify_request_status(
        self,
        telegram_id: int,
        request_id: int,
        status: str,
        status_name: str,
        comment: Optional[str] = None
    ):
        """Уведомление об изменении статуса заявки"""
        status_emoji = {
            "accepted": "✅",
            "in_progress": "🔧",
            "completed": "✨",
            "rejected": "❌"
        }

        message = (
            f"{status_emoji.get(status, '📋')} Заявка #{request_id}\n\n"
            f"Статус изменен: *{status_name}*"
        )

        if comment:
            message += f"\n\nКомментарий: {comment}"

        # Добавляем кнопку для оценки если выполнена
        keyboard = None
        if status == "completed":
            keyboard = rate_request_keyboard(request_id)

        await self.bot.send_message(
            telegram_id,
            message,
            parse_mode="Markdown",
            reply_markup=keyboard
        )

    async def notify_payment_reminder(
        self,
        telegram_id: int,
        amount: float,
        due_date: str
    ):
        """Напоминание об оплате"""
        message = (
            f"💰 Напоминание об оплате\n\n"
            f"Сумма: {amount:,.0f} сум\n"
            f"Срок оплаты: {due_date}\n\n"
            f"Нажмите 'Оплатить' для перехода к оплате"
        )

        await self.bot.send_message(
            telegram_id,
            message,
            reply_markup=payment_keyboard()
        )

    async def broadcast_news(
        self,
        telegram_ids: List[int],
        title: str,
        content: str,
        image_url: Optional[str] = None
    ):
        """Рассылка новостей"""
        for telegram_id in telegram_ids:
            try:
                if image_url:
                    await self.bot.send_photo(
                        telegram_id,
                        image_url,
                        caption=f"📢 *{title}*\n\n{content}",
                        parse_mode="Markdown"
                    )
                else:
                    await self.bot.send_message(
                        telegram_id,
                        f"📢 *{title}*\n\n{content}",
                        parse_mode="Markdown"
                    )
            except Exception as e:
                # Логируем ошибку, продолжаем рассылку
                print(f"Failed to send to {telegram_id}: {e}")
```

### Мультиязычность

```python
# middlewares/i18n.py
from typing import Any, Callable, Dict, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, User
from fluent.runtime import FluentLocalization, FluentResourceLoader

LOCALES = {
    "ru": "ru",
    "uz": "uz",
    "en": "ru"  # fallback
}

loader = FluentResourceLoader("locales/{locale}")

def get_localization(locale: str) -> FluentLocalization:
    return FluentLocalization(
        [locale, "ru"],
        ["main.ftl", "requests.ftl", "payments.ftl"],
        loader
    )

class I18nMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        user: User = data.get("event_from_user")

        if user:
            locale = LOCALES.get(user.language_code, "ru")
            # Проверяем сохраненный язык пользователя
            saved_locale = await get_user_locale(user.id)
            if saved_locale:
                locale = saved_locale
        else:
            locale = "ru"

        data["locale"] = locale
        data["l10n"] = get_localization(locale)
        data["_"] = lambda key, **kwargs: data["l10n"].format_value(key, kwargs)

        return await handler(event, data)
```

### Файлы локализации

```ftl
# locales/ru/main.ftl
welcome = Добро пожаловать в систему управляющей компании!
main-menu = Главное меню
new-request = 📝 Новая заявка
my-requests = 📋 Мои заявки
payments = 💰 Оплата
meters = 📊 Показания
profile = 👤 Профиль
settings = ⚙️ Настройки

# locales/uz/main.ftl
welcome = Boshqaruv kompaniyasi tizimiga xush kelibsiz!
main-menu = Asosiy menyu
new-request = 📝 Yangi ariza
my-requests = 📋 Mening arizalarim
payments = 💰 To'lov
meters = 📊 Ko'rsatkichlar
profile = 👤 Profil
settings = ⚙️ Sozlamalar
```

---

## API Endpoints для бота

### Webhook endpoint

```python
# В основном API приложении
@app.post("/api/telegram/notify")
async def send_telegram_notification(
    request: NotificationRequest,
    api_key: str = Depends(verify_api_key)
):
    """Отправка уведомления в Telegram из основного API"""
    notification_service = NotificationService(bot)

    if request.type == "request_status":
        await notification_service.notify_request_status(
            telegram_id=request.telegram_id,
            request_id=request.request_id,
            status=request.status,
            status_name=request.status_name,
            comment=request.comment
        )
    elif request.type == "payment_reminder":
        await notification_service.notify_payment_reminder(
            telegram_id=request.telegram_id,
            amount=request.amount,
            due_date=request.due_date
        )

    return {"status": "sent"}
```

---

## Команды бота

| Команда | Описание |
|---------|----------|
| /start | Начало работы / регистрация |
| /menu | Главное меню |
| /request | Новая заявка |
| /status | Статус заявок |
| /pay | Оплата |
| /meters | Передать показания |
| /help | Помощь |
| /settings | Настройки |
| /language | Сменить язык |

---

## Тестирование

### Test Bot

1. Создать тестового бота через @BotFather
2. Настроить локальный webhook через ngrok
3. Тестировать все сценарии

### Checklist

- [ ] Регистрация нового пользователя
- [ ] Создание заявки со всеми типами контента
- [ ] Отмена на любом этапе
- [ ] Уведомления о статусах
- [ ] Смена языка
- [ ] Обработка ошибок API
- [ ] Rate limiting
