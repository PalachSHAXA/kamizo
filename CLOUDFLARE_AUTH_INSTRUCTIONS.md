# Инструкция по авторизации Cloudflare

## Проблема
Команда `wrangler login` пытается открыть локальный сервер на localhost:8976, но он не может запуститься из-за таймаута.

## Решение: Использовать API Token

### Шаг 1: Создать API Token в Cloudflare

1. Откройте браузер и перейдите на: **https://dash.cloudflare.com/profile/api-tokens**

2. Нажмите кнопку **"Create Token"**

3. Найдите шаблон **"Edit Cloudflare Workers"** и нажмите **"Use template"**

4. Настройки должны быть такими:
   - **Permissions:**
     - Account → Workers Scripts → Edit
     - Account → Workers KV Storage → Edit
     - Account → D1 → Edit
     - Account → Account Settings → Read
   - **Account Resources:**
     - Include → Your Account (выберите ваш аккаунт)
   - **Zone Resources:**
     - Include → All zones

5. Нажмите **"Continue to summary"**

6. Нажмите **"Create Token"**

7. **СКОПИРУЙТЕ ТОКЕН** (он показывается только один раз!)

### Шаг 2: Использовать токен для деплоя

После того как вы получили токен, выполните эту команду (замените `YOUR_TOKEN` на ваш токен):

```bash
export CLOUDFLARE_API_TOKEN=YOUR_TOKEN
cd cloudflare
npx wrangler deploy
```

### Или используйте переменную окружения в PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN="YOUR_TOKEN"
cd cloudflare
npx wrangler deploy
```

---

## После деплоя

Ваше приложение будет доступно по адресу: **https://app.myhelper.uz**

Изменения в карточках статистики (кликабельность) будут применены!
