// Аудитория объявления — общее описание «кому это адресовано».
//
// Зачем файл: у объявления есть таргетинг (target_type + target_branch /
// target_building_id / target_entrance / target_floor / target_logins),
// и до сих пор он разбирался ровно в одном месте — в push-фанауте
// routes/misc/announcements-mutations.ts. Теперь тот же таргетинг нужен
// второму потребителю: рассылке в Telegram-группы. Разобрать его там
// заново означало бы две копии правил адресации, которые неизбежно
// разъедутся — а в этой конкретной логике уже чинили три утечки между
// тенантами (Sprint 67 P0 #1–#3). ТЗ §27 дублирование прямо запрещает.
//
// Здесь лежит НОРМАЛИЗАЦИЯ дескриптора, а не сами SQL-запросы:
// потребители выбирают разные сущности (пользователей против групп), но
// обязаны одинаково понимать, что значит «на подъезд» или «на филиал».
//
// TODO: push-фанаут в announcements-mutations.ts всё ещё разбирает
// body.* самостоятельно. Перевести его на normalizeAudience() стоит
// отдельным изменением: это живой код с историей исправлений по
// безопасности, и менять его попутно с новой фичей — плохая идея.

export type AnnouncementTargetType =
  | 'all' | 'branch' | 'building' | 'entrance' | 'floor' | 'custom';

export interface Audience {
  targetType: AnnouncementTargetType;
  branch: string | null;
  buildingId: string | null;
  // Метка подъезда, а НЕ entrances.id. Таблица entrances в проекте
  // есть, но путь адресации объявлений её не касается: сравниваются
  // announcements.target_entrance и users.entrance — оба TEXT с
  // номером подъезда. Всё, что хочет участвовать в этой адресации,
  // обязано хранить ту же текстовую метку.
  entrance: string | null;
  floor: string | null;
  logins: string[];
}

const TARGET_TYPES = new Set<string>(
  ['all', 'branch', 'building', 'entrance', 'floor', 'custom']
);

// Разбор тела запроса объявления в нормализованный дескриптор.
//
// Неизвестный target_type схлопывается в 'all' — ровно так же ведёт
// себя нынешний push-фанаут (`body.target_type || 'all'`), и менять это
// поведение в рамках добавления Telegram нельзя.
export function normalizeAudience(body: any): Audience {
  const raw = typeof body?.target_type === 'string' ? body.target_type : 'all';
  const targetType = (TARGET_TYPES.has(raw) ? raw : 'all') as AnnouncementTargetType;

  let logins: string[] = [];
  if (typeof body?.target_logins === 'string' && body.target_logins.trim()) {
    logins = Array.from(new Set(
      body.target_logins.split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.length <= 100)
    ));
  }

  return {
    targetType,
    branch: body?.target_branch || null,
    buildingId: body?.target_building_id || null,
    entrance: body?.target_entrance || null,
    floor: body?.target_floor || null,
    logins,
  };
}

// Тот же дескриптор, восстановленный из уже сохранённой строки
// announcements. Нужен для повторной отправки из суперадминки (§18) и
// для правки объявления (§9), когда исходного тела запроса уже нет.
export function audienceFromRow(row: any): Audience {
  return normalizeAudience({
    target_type: row?.target_type,
    target_branch: row?.target_branch,
    target_building_id: row?.target_building_id,
    target_entrance: row?.target_entrance,
    target_floor: row?.target_floor,
    // В БД логины лежат в канонической форме ",login1,login2,".
    target_logins: typeof row?.target_logins === 'string'
      ? row.target_logins.replace(/^,|,$/g, '')
      : null,
  });
}
