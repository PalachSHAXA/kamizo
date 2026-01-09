# Фаза 3: Инновации (3-4 месяца)

## Цели фазы

- Внедрение AI/ML для автоматизации
- IoT интеграции для умного дома
- Геймификация для повышения лояльности
- Предиктивная аналитика

---

## Модуль 3.1: AI Чат-бот (4 недели)

### Описание
Интеллектуальный чат-бот для ответов на типовые вопросы жителей.

### Архитектура

```
┌─────────────────┐
│  Telegram Bot   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Intent Router  │
│                 │
│ ├─ FAQ (AI)     │──► LLM / Vector DB
│ ├─ Request      │──► Request Service
│ ├─ Payment      │──► Payment Service
│ └─ Human        │──► Dispatcher Queue
└─────────────────┘
```

### Реализация

```python
# Intent Classification
from transformers import pipeline

class IntentClassifier:
    def __init__(self):
        self.classifier = pipeline(
            "text-classification",
            model="your-intent-model"
        )

    def classify(self, text: str) -> str:
        result = self.classifier(text)
        return result[0]['label']

# RAG для FAQ
from langchain.vectorstores import FAISS
from langchain.embeddings import OpenAIEmbeddings
from langchain.chains import RetrievalQA

class FAQBot:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings()
        self.vectorstore = FAISS.load_local("faq_index", self.embeddings)
        self.qa_chain = RetrievalQA.from_chain_type(
            llm=ChatOpenAI(model="gpt-3.5-turbo"),
            retriever=self.vectorstore.as_retriever()
        )

    async def answer(self, question: str) -> str:
        result = await self.qa_chain.arun(question)
        return result

# Интеграция в Telegram
@router.message()
async def handle_message(message: Message, state: FSMContext):
    user_state = await state.get_state()

    if user_state:
        # Пользователь в процессе (заявка, оплата)
        return await handle_flow(message, state)

    # Классификация намерения
    intent = intent_classifier.classify(message.text)

    if intent == "faq":
        answer = await faq_bot.answer(message.text)
        await message.answer(answer)

    elif intent == "new_request":
        await start_request_flow(message, state)

    elif intent == "check_status":
        await show_request_status(message)

    elif intent == "payment":
        await show_payment_options(message)

    else:
        # Передача человеку
        await route_to_dispatcher(message)
```

### База знаний FAQ

```yaml
# faq_data.yaml
categories:
  - name: "Оплата"
    questions:
      - q: "Как оплатить коммунальные услуги?"
        a: "Вы можете оплатить через приложение, Telegram бот или Payme/Click напрямую."

      - q: "Где посмотреть квитанцию?"
        a: "Квитанция доступна в разделе 'Платежи' приложения или по команде /receipt в боте."

  - name: "Заявки"
    questions:
      - q: "Как подать заявку на ремонт?"
        a: "Отправьте /request в боте или нажмите 'Новая заявка' в приложении."

      - q: "Сколько ждать выполнения заявки?"
        a: "Стандартный срок - 72 часа. Аварийные заявки обрабатываются в течение 2 часов."
```

### Метрики

- % вопросов, отвеченных ботом (цель: 60%+)
- Accuracy ответов (ручная проверка)
- Среднее время до ответа
- Удовлетворенность (thumbs up/down)

### Deliverables
- AI чат-бот отвечает на типовые вопросы
- База знаний с 50+ FAQ
- Эскалация на человека при необходимости
- Аналитика использования

---

## Модуль 3.2: Computer Vision для заявок (3 недели)

### Описание
Автоматическое распознавание типа проблемы по фотографии.

### Модель

```python
# Image Classification Model
import torch
from torchvision import models, transforms
from PIL import Image

class ProblemClassifier:
    def __init__(self, model_path: str):
        self.model = models.resnet50(pretrained=False)
        self.model.fc = torch.nn.Linear(2048, len(CATEGORIES))
        self.model.load_state_dict(torch.load(model_path))
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

    def predict(self, image: Image) -> dict:
        img_tensor = self.transform(image).unsqueeze(0)
        with torch.no_grad():
            outputs = self.model(img_tensor)
            probabilities = torch.nn.functional.softmax(outputs, dim=1)
            top_prob, top_idx = probabilities.topk(3)

        return {
            "predictions": [
                {"category": CATEGORIES[idx], "confidence": prob.item()}
                for prob, idx in zip(top_prob[0], top_idx[0])
            ]
        }

CATEGORIES = [
    "plumbing_leak",      # Протечка
    "electrical_issue",   # Электрика
    "broken_door",        # Сломанная дверь
    "elevator_problem",   # Лифт
    "heating_issue",      # Отопление
    "ventilation",        # Вентиляция
    "other"               # Другое
]
```

### Интеграция

```python
# В обработчике фото заявки
@router.message(NewRequest.photo, F.photo)
async def process_request_photo(message: Message, state: FSMContext):
    # Скачиваем фото
    photo = message.photo[-1]
    file = await bot.get_file(photo.file_id)
    photo_bytes = await bot.download_file(file.file_path)

    # Распознаем проблему
    image = Image.open(io.BytesIO(photo_bytes))
    prediction = problem_classifier.predict(image)

    top_prediction = prediction["predictions"][0]

    if top_prediction["confidence"] > 0.7:
        # Уверенное распознавание - предлагаем категорию
        await message.answer(
            f"Похоже на: {CATEGORY_NAMES[top_prediction['category']]}\n"
            "Это верно?",
            reply_markup=confirm_category_keyboard(top_prediction['category'])
        )
    else:
        # Неуверенное - показываем топ-3
        await message.answer(
            "Выберите категорию:",
            reply_markup=category_suggestions_keyboard(prediction["predictions"])
        )
```

### Обучение модели

```python
# Dataset для дообучения
class RequestImagesDataset(Dataset):
    def __init__(self, data_dir: str, transform=None):
        self.data_dir = data_dir
        self.transform = transform
        self.images = []
        self.labels = []

        for category_idx, category in enumerate(CATEGORIES):
            category_dir = os.path.join(data_dir, category)
            for img_name in os.listdir(category_dir):
                self.images.append(os.path.join(category_dir, img_name))
                self.labels.append(category_idx)

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        image = Image.open(self.images[idx]).convert('RGB')
        if self.transform:
            image = self.transform(image)
        return image, self.labels[idx]

# Training loop
def train_model(model, train_loader, epochs=10):
    criterion = torch.nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

    for epoch in range(epochs):
        model.train()
        for images, labels in train_loader:
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
```

### Deliverables
- Модель распознавания с accuracy 75%+
- Интеграция в Telegram бот
- Сбор данных для улучшения модели

---

## Модуль 3.3: IoT Интеграции (4 недели)

### Умные счетчики

```python
# LoRaWAN Gateway Integration
class LoRaWANClient:
    def __init__(self, gateway_url: str, api_key: str):
        self.gateway_url = gateway_url
        self.api_key = api_key

    async def get_device_data(self, device_eui: str) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.gateway_url}/devices/{device_eui}/data",
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            return response.json()

# Автоматический сбор показаний
@celery.task
def collect_smart_meter_readings():
    meters = get_smart_meters()

    for meter in meters:
        data = lorawan_client.get_device_data(meter.device_eui)
        reading = MeterReading(
            meter_id=meter.id,
            apartment_id=meter.apartment_id,
            value=data['value'],
            source='auto',
            created_at=datetime.utcnow()
        )
        db.add(reading)

    db.commit()
```

### Видеодомофоны

```python
# Интеграция с SIP домофонами
class IntercomService:
    def __init__(self, sip_server: str):
        self.sip_server = sip_server

    async def open_door(self, intercom_id: str, user_id: str) -> bool:
        """Открыть дверь через приложение"""
        # Проверяем права доступа
        if not await self.check_access(user_id, intercom_id):
            raise AccessDenied()

        # Отправляем команду на открытие
        result = await self.send_command(intercom_id, "unlock")

        # Логируем
        await self.log_access(intercom_id, user_id, "app_unlock")

        return result

    async def stream_video(self, intercom_id: str) -> str:
        """Получить URL видеопотока"""
        return f"rtsp://{self.sip_server}/stream/{intercom_id}"

# API endpoint
@router.post("/intercoms/{intercom_id}/unlock")
async def unlock_door(
    intercom_id: str,
    current_user: User = Depends(get_current_user)
):
    await intercom_service.open_door(intercom_id, current_user.id)
    return {"status": "unlocked"}
```

### Smart Home Dashboard

```jsx
// React компонент для управления умным домом
function SmartHomeWidget({ apartmentId }) {
  const { data: devices } = useQuery({
    queryKey: ['smart-devices', apartmentId],
    queryFn: () => api.getSmartDevices(apartmentId)
  });

  return (
    <div className="smart-home-grid">
      {/* Показания счетчиков */}
      <MeterCard
        type="water_cold"
        value={devices.meters.water_cold}
        unit="м³"
      />
      <MeterCard
        type="electricity"
        value={devices.meters.electricity}
        unit="кВт·ч"
      />

      {/* Домофон */}
      <IntercomCard
        stream={devices.intercom.stream_url}
        onUnlock={() => api.unlockDoor(devices.intercom.id)}
      />

      {/* Датчики */}
      <SensorCard
        type="temperature"
        value={devices.sensors.temperature}
      />
    </div>
  );
}
```

### Deliverables
- Интеграция с 2+ типами умных счетчиков
- Управление домофоном через приложение
- Dashboard умного дома

---

## Модуль 3.4: Геймификация (2 недели)

### Resident Rewards

```python
# Система баллов
class RewardsService:
    POINT_RULES = {
        "on_time_payment": 100,         # Оплата вовремя
        "early_payment": 50,            # Оплата до 15 числа
        "meter_reading": 20,            # Передача показаний
        "positive_review": 30,          # Положительный отзыв
        "referral": 200,                # Приглашение соседа
    }

    async def award_points(
        self,
        resident_id: str,
        action: str,
        metadata: dict = None
    ):
        points = self.POINT_RULES.get(action, 0)
        if points == 0:
            return

        transaction = PointTransaction(
            resident_id=resident_id,
            action=action,
            points=points,
            metadata=metadata
        )
        await db.add(transaction)

        # Обновляем баланс
        await self.update_balance(resident_id, points)

        # Проверяем достижения
        await self.check_achievements(resident_id)

    async def redeem_points(
        self,
        resident_id: str,
        reward_id: str
    ):
        reward = await get_reward(reward_id)
        balance = await self.get_balance(resident_id)

        if balance < reward.points_cost:
            raise InsufficientPoints()

        # Списываем баллы
        await self.deduct_points(resident_id, reward.points_cost)

        # Выдаем награду
        await self.issue_reward(resident_id, reward)

# Награды
REWARDS = [
    {"id": "discount_5", "name": "Скидка 5% на услуги", "points": 500},
    {"id": "free_cleaning", "name": "Бесплатная уборка подъезда", "points": 1000},
    {"id": "parking_month", "name": "Парковка на месяц", "points": 2000},
]
```

### Achievements

```python
ACHIEVEMENTS = [
    {
        "id": "first_payment",
        "name": "Первый платеж",
        "description": "Совершите первую оплату через приложение",
        "icon": "💰",
        "condition": lambda stats: stats.payments_count >= 1
    },
    {
        "id": "punctual",
        "name": "Пунктуальный",
        "description": "Оплачивайте вовремя 6 месяцев подряд",
        "icon": "⏰",
        "condition": lambda stats: stats.on_time_streak >= 6
    },
    {
        "id": "engaged",
        "name": "Активный житель",
        "description": "Передавайте показания 12 месяцев подряд",
        "icon": "📊",
        "condition": lambda stats: stats.readings_streak >= 12
    },
]
```

### Leaderboard

```jsx
function ResidentLeaderboard({ buildingId }) {
  const { data: leaders } = useQuery({
    queryKey: ['leaderboard', buildingId],
    queryFn: () => api.getLeaderboard(buildingId)
  });

  return (
    <div className="leaderboard">
      <h3>🏆 Лучшие жители месяца</h3>
      {leaders.map((resident, index) => (
        <div className="leader-row" key={resident.id}>
          <span className="rank">{index + 1}</span>
          <span className="name">{resident.name}</span>
          <span className="points">{resident.points} баллов</span>
          <div className="badges">
            {resident.achievements.map(a => (
              <span key={a.id} title={a.name}>{a.icon}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Deliverables
- Система начисления баллов
- Каталог наград
- Достижения и badges
- Leaderboard по домам

---

## Модуль 3.5: Предиктивная аналитика (3 недели)

### Прогноз задолженностей

```python
# ML модель для прогноза неплатежей
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier

class DebtPredictionModel:
    def __init__(self):
        self.model = GradientBoostingClassifier(
            n_estimators=100,
            max_depth=5
        )

    def prepare_features(self, resident_id: str) -> pd.DataFrame:
        """Подготовка признаков для предсказания"""
        features = {
            'avg_payment_delay': get_avg_payment_delay(resident_id),
            'missed_payments_count': get_missed_payments(resident_id),
            'total_debt': get_current_debt(resident_id),
            'months_as_resident': get_residency_months(resident_id),
            'last_payment_days_ago': get_last_payment_days(resident_id),
            'income_estimate': estimate_income(resident_id),  # по району
            'season': datetime.now().month,
        }
        return pd.DataFrame([features])

    def predict_risk(self, resident_id: str) -> dict:
        """Предсказание риска неплатежа"""
        features = self.prepare_features(resident_id)
        probability = self.model.predict_proba(features)[0][1]

        risk_level = (
            "high" if probability > 0.7
            else "medium" if probability > 0.4
            else "low"
        )

        return {
            "probability": probability,
            "risk_level": risk_level,
            "factors": self.get_risk_factors(features)
        }

    def get_risk_factors(self, features: pd.DataFrame) -> list:
        """Объяснение факторов риска"""
        factors = []
        if features['avg_payment_delay'].values[0] > 10:
            factors.append("Частые задержки платежей")
        if features['total_debt'].values[0] > 100000:
            factors.append("Высокая текущая задолженность")
        return factors
```

### Прогноз заявок

```python
# Time series прогноз количества заявок
from prophet import Prophet

class RequestForecast:
    def __init__(self):
        self.model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True
        )

    def train(self, historical_data: pd.DataFrame):
        """
        historical_data: DataFrame с колонками 'ds' (date) и 'y' (count)
        """
        self.model.fit(historical_data)

    def forecast(self, periods: int = 30) -> pd.DataFrame:
        """Прогноз на N дней вперед"""
        future = self.model.make_future_dataframe(periods=periods)
        forecast = self.model.predict(future)
        return forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]

# Использование для планирования персонала
@celery.task
def generate_staff_schedule():
    forecast = request_forecast.forecast(periods=7)

    for day in forecast.itertuples():
        expected_requests = day.yhat
        recommended_staff = calculate_staff_needed(expected_requests)

        notify_manager(
            f"На {day.ds}: ожидается {expected_requests:.0f} заявок, "
            f"рекомендуется {recommended_staff} сотрудников"
        )
```

### Dashboard предиктивной аналитики

```jsx
function PredictiveAnalyticsDashboard() {
  return (
    <div className="predictive-dashboard">
      {/* Риск неплатежей */}
      <RiskHeatmap
        title="Риск неплатежей по домам"
        data={riskByBuilding}
      />

      {/* Прогноз заявок */}
      <ForecastChart
        title="Прогноз заявок на неделю"
        historical={historicalRequests}
        forecast={requestForecast}
      />

      {/* Рекомендации */}
      <RecommendationsList
        title="Рекомендуемые действия"
        items={[
          "Направить напоминание жителям дома №5 (высокий риск)",
          "Увеличить персонал в понедельник (пик заявок)",
          "Провести профилактику лифта в доме №3"
        ]}
      />
    </div>
  );
}
```

### Deliverables
- Модель прогноза задолженностей (accuracy 80%+)
- Прогноз количества заявок
- Dashboard с рекомендациями
- Автоматические алерты

---

## Timeline Фазы 3

```
Неделя 1-4:   AI Чат-бот
Неделя 5-7:   Computer Vision
Неделя 8-11:  IoT Интеграции
Неделя 12-13: Геймификация
Неделя 14-16: Предиктивная аналитика
```

---

## Метрики успеха Фазы 3

- AI бот отвечает на 60%+ вопросов без человека
- Точность распознавания фото 75%+
- 3+ IoT интеграции в production
- 50%+ жителей участвуют в программе лояльности
- Точность прогноза задолженностей 80%+
