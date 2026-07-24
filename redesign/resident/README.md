# Редизайн PWA жителя — индекс

Делаем по одному экрану за раз. Для каждого: вставь в Claude сначала `../00-FOUNDATION.md`,
затем нужный файл из этой папки. Внутри каждого файла есть готовый блок **«ПРОМТ»** — это то,
что фетчишь. Остальное (функционал, креатив) — контекст для тебя и для качества ответа.

Все экраны — mobile-first PWA, тёплая бежево-оранжевая палитра, тёмный stone-акцент.

## Порядок (от ядра к периферии)

| № | Экран | Файл | Компонент |
|---|---|---|---|
| 01 | Главная | `01-glavnaya.md` | `ResidentDashboard` (home tab) + `resident/components/HomeTab` + widgets |
| 02 | Заявки (список) | `02-zayavki.md` | `ResidentDashboard` (requests tab) + `RequestsTab` |
| 03 | Новая заявка | `03-novaya-zayavka.md` | `ServiceBottomSheet` + `NewRequestModal` |
| 04 | Детали и приёмка заявки | `04-detali-zayavki.md` | `RequestDetailsModal` + `ApproveModal` + cancel/reschedule |
| 05 | Собрания и голосование | `05-sobraniya.md` | `ResidentMeetingsPage` + `MeetingVotingModal` |
| 06 | Объявления | `06-obyavleniya.md` | `ResidentAnnouncementsPage` + `AnnouncementCard` |
| 07 | Гостевые пропуска | `07-propuska.md` | `ResidentGuestAccessPage` + `guest-access/*` |
| 08 | Авто | `08-avto.md` | `ResidentVehiclesPage` + `vehicles/*` |
| 09 | Оплата и начисления | `09-oplata.md` | `finance/ChargesPage` + баланс из дашборда |
| 10 | Маркетплейс | `10-marketplace.md` | `MarketplacePage` + `ServiceBottomSheet` |
| 11 | Мои заказы | `11-zakazy.md` | `MarketplaceOrdersPage` |
| 12 | Чат | `12-chat.md` | `ChatPage` + `chat/*` |
| 13 | Профиль | `13-profil.md` | `ResidentProfilePage` |
| 14 | Договор | `14-dogovor.md` | `ResidentContractPage` |
| 15 | Полезные контакты | `15-kontakty.md` | `ResidentUsefulContactsPage` |
| 16 | Оценка сотрудников | `16-ocenka.md` | `ResidentRateEmployeesPage` |

## Общие правила креатива для всех экранов жителя

- **Фото:** тёплая «жилая» фотография (двор, подъезд, люди-соседи) — приглушённая, с бежевым
  оверлеем, не сток-глянец. Использовать редко: hero главной, пустые состояния, договор.
- **Иллюстрации:** лёгкие линейные/флэт в бежево-оранжевой гамме для пустых состояний.
- **Анимации:** появление 8px+fade; нажатие `scale(0.97)`; счётчики/числа — count-up; прогресс
  кворума/оплаты — плавная заливка; bottom-sheet выезжает снизу на `--ease-spring`; pull-to-refresh.
  Уважать `prefers-reduced-motion`.
- **Микро-взаимодействия:** haptic-подобный отклик кнопок, мягкий «тик» при смене таба,
  конфетти/чек-галочка при успешной приёмке заявки или оплате (тонко, не цирк).
