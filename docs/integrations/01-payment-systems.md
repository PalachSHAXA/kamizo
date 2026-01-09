# Интеграция платежных систем

## Обзор рынка

Payme и Click покрывают **95%** рынка онлайн-платежей в Узбекистане.

## Payme Integration

### Регистрация мерчанта

1. Заявка на payme.uz/business
2. Подписание договора
3. Получение credentials:
   - Merchant ID
   - Secret Key (PAYCOM_KEY)

### Merchant API

**Base URL:** `https://checkout.paycom.uz/api`

**Методы:**

```javascript
// CheckPerformTransaction - проверка возможности платежа
{
  "method": "CheckPerformTransaction",
  "params": {
    "amount": 500000,
    "account": {
      "order_id": "123",
      "user_id": "456"
    }
  }
}

// CreateTransaction - создание транзакции
{
  "method": "CreateTransaction",
  "params": {
    "id": "transaction_id",
    "time": 1234567890,
    "amount": 500000,
    "account": {
      "order_id": "123"
    }
  }
}

// PerformTransaction - выполнение платежа
{
  "method": "PerformTransaction",
  "params": {
    "id": "transaction_id"
  }
}

// CancelTransaction - отмена
{
  "method": "CancelTransaction",
  "params": {
    "id": "transaction_id",
    "reason": 1
  }
}

// GetStatement - выписка
{
  "method": "GetStatement",
  "params": {
    "from": 1234567890,
    "to": 1234567899
  }
}
```

### Subscribe API (Автоплатежи)

**Создание подписки:**
```javascript
{
  "method": "cards.create",
  "params": {
    "card": {
      "number": "8600123456789012",
      "expire": "0325"
    },
    "save": true
  }
}
```

**Рекуррентный платеж:**
```javascript
{
  "method": "receipts.pay",
  "params": {
    "id": "receipt_id",
    "token": "card_token"
  }
}
```

### Webhook обработка

```python
# webhook_handler.py
from flask import Flask, request, jsonify
import hashlib
import base64

app = Flask(__name__)
PAYCOM_KEY = "your_secret_key"

def verify_auth(request):
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Basic '):
        return False

    credentials = base64.b64decode(auth[6:]).decode()
    login, password = credentials.split(':')
    return login == 'Paycom' and password == PAYCOM_KEY

@app.route('/payme/webhook', methods=['POST'])
def payme_webhook():
    if not verify_auth(request):
        return jsonify({"error": {"code": -32504, "message": "Unauthorized"}}), 401

    data = request.json
    method = data.get('method')
    params = data.get('params', {})

    if method == 'CheckPerformTransaction':
        return check_perform_transaction(params)
    elif method == 'CreateTransaction':
        return create_transaction(params)
    elif method == 'PerformTransaction':
        return perform_transaction(params)
    elif method == 'CancelTransaction':
        return cancel_transaction(params)
    elif method == 'GetStatement':
        return get_statement(params)

    return jsonify({"error": {"code": -32601, "message": "Method not found"}})
```

---

## Click Integration

### Регистрация мерчанта

1. Заявка на click.uz для бизнеса
2. Подписание договора
3. Получение credentials:
   - Service ID
   - Merchant ID
   - Secret Key

### SHOP-API

**Prepare URL:**
```
POST https://your-domain.com/click/prepare
```

**Parameters:**
```json
{
  "click_trans_id": "123456",
  "service_id": "12345",
  "click_paydoc_id": "789",
  "merchant_trans_id": "order_123",
  "amount": 50000,
  "action": 0,
  "error": 0,
  "error_note": "",
  "sign_time": "2024-01-15 12:00:00",
  "sign_string": "md5_hash"
}
```

**Complete URL:**
```
POST https://your-domain.com/click/complete
```

### Verify Sign String

```python
import hashlib

def verify_click_sign(params, secret_key):
    sign_string = (
        f"{params['click_trans_id']}"
        f"{params['service_id']}"
        f"{secret_key}"
        f"{params['merchant_trans_id']}"
        f"{params['amount']}"
        f"{params['action']}"
        f"{params['sign_time']}"
    )

    expected_sign = hashlib.md5(sign_string.encode()).hexdigest()
    return expected_sign == params['sign_string']
```

### Webhook обработка

```python
@app.route('/click/prepare', methods=['POST'])
def click_prepare():
    params = request.form.to_dict()

    if not verify_click_sign(params, CLICK_SECRET):
        return jsonify({
            "error": -1,
            "error_note": "Invalid signature"
        })

    order = get_order(params['merchant_trans_id'])
    if not order:
        return jsonify({
            "error": -5,
            "error_note": "Order not found"
        })

    if order.amount != int(params['amount']):
        return jsonify({
            "error": -2,
            "error_note": "Invalid amount"
        })

    return jsonify({
        "click_trans_id": params['click_trans_id'],
        "merchant_trans_id": params['merchant_trans_id'],
        "merchant_prepare_id": order.id,
        "error": 0,
        "error_note": "Success"
    })

@app.route('/click/complete', methods=['POST'])
def click_complete():
    params = request.form.to_dict()

    if params.get('error') != '0':
        return jsonify({
            "error": -9,
            "error_note": "Transaction cancelled"
        })

    order = get_order(params['merchant_trans_id'])
    order.status = 'paid'
    order.save()

    return jsonify({
        "click_trans_id": params['click_trans_id'],
        "merchant_trans_id": params['merchant_trans_id'],
        "merchant_confirm_id": order.id,
        "error": 0,
        "error_note": "Success"
    })
```

---

## PayTechUZ - Unified SDK

Библиотека объединяет интеграции Payme и Click.

**Установка:**
```bash
pip install paytechuz
```

**Использование:**
```python
from paytechuz import Payme, Click

# Payme
payme = Payme(merchant_id="your_id", key="your_key")
result = payme.create_transaction(amount=50000, order_id="123")

# Click
click = Click(service_id="your_id", merchant_id="your_id", secret="your_secret")
result = click.create_invoice(amount=50000, order_id="123")
```

---

## База данных для платежей

```sql
-- Таблица транзакций
CREATE TABLE payment_transactions (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,
    provider ENUM('payme', 'click') NOT NULL,
    resident_id INTEGER REFERENCES residents(id),
    apartment_id INTEGER REFERENCES apartments(id),
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled', 'failed') DEFAULT 'pending',
    payment_type ENUM('one_time', 'recurring') DEFAULT 'one_time',

    -- Payme specific
    payme_transaction_id VARCHAR(100),
    payme_state INTEGER,

    -- Click specific
    click_trans_id VARCHAR(100),
    click_paydoc_id VARCHAR(100),

    error_code VARCHAR(50),
    error_message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Таблица автоплатежей
CREATE TABLE recurring_payments (
    id SERIAL PRIMARY KEY,
    resident_id INTEGER REFERENCES residents(id),
    provider ENUM('payme', 'click') NOT NULL,
    card_token VARCHAR(255) NOT NULL,
    card_last_four VARCHAR(4),
    is_active BOOLEAN DEFAULT true,
    next_payment_date DATE,
    amount DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- История платежей для выписки
CREATE TABLE payment_history (
    id SERIAL PRIMARY KEY,
    apartment_id INTEGER REFERENCES apartments(id),
    period DATE NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    debt DECIMAL(12,2) GENERATED ALWAYS AS (amount - paid_amount) STORED,
    transaction_id INTEGER REFERENCES payment_transactions(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Тестирование

### Payme Sandbox

**Test credentials:**
- Merchant ID: тестовый ID
- Key: тестовый ключ
- Test cards: документация Payme

### Click Sandbox

**Test mode:**
- Установить test=1 в параметрах
- Тестовые карты из документации

### Checklist тестирования

- [ ] Успешный платеж
- [ ] Отмена платежа
- [ ] Недостаточно средств
- [ ] Неверная сумма
- [ ] Дубликат транзакции
- [ ] Таймаут
- [ ] Рекуррентный платеж
- [ ] Webhook retry
