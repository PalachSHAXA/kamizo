import type { Env } from '../types';
import prototypeVectors from './ai-listener-prototype-vectors.json';
import type { NavigationIntent } from './navigation-intent';
import { detectLanguage, type ZhkhCategory, type ZhkhLang } from './zhkh-classifier';

export type LocalAiListenerResult =
  | { kind: 'navigation'; intent: NavigationIntent; confidence: number; similarity: number; margin: number; lang: ZhkhLang }
  | { kind: 'maintenance'; category: ZhkhCategory; confidence: number; similarity: number; margin: number; lang: ZhkhLang }
  | { kind: 'none'; confidence: number; similarity: number; margin: number; lang: ZhkhLang };

type Prototype =
  | { kind: 'navigation'; intent: NavigationIntent; text: string }
  | { kind: 'maintenance'; category: ZhkhCategory; text: string }
  | { kind: 'none'; text: string };

// Each prototype deliberately contains Russian, Uzbek Latin and Uzbek
// Cyrillic examples. They are configuration, not resident messages.
export const AI_LISTENER_PROTOTYPES: Prototype[] = [
  { kind: 'maintenance', category: 'leak', text: 'passage: течет вода протечка затопило трубу прорвало; suv oqyapti quvur yorildi; сув оқяпти қувур ёрилди' },
  { kind: 'maintenance', category: 'sewage', text: 'passage: засор канализации неприятный запах стоки; kanalizatsiya tiqildi hid; канализация тиқилди ҳид' },
  { kind: 'maintenance', category: 'electricity', text: 'passage: нет света электричество проводка искрит; elektr o‘chdi sim kuygan; электр ўчди сим куйган' },
  { kind: 'maintenance', category: 'elevator', text: 'passage: лифт сломан застрял не работает; lift ishlamayapti; лифт ишламаяпти' },
  { kind: 'maintenance', category: 'heating', text: 'passage: холодные батареи нет отопления; isitish yo‘q radiator sovuq; иситиш йўқ батарея совуқ' },
  { kind: 'maintenance', category: 'garbage', text: 'passage: мусор не вывезли контейнер переполнен; chiqindi olib ketilmadi; чиқинди олиб кетилмади' },
  { kind: 'maintenance', category: 'lighting', text: 'passage: лампа перегорела темно в подъезде; chiroq yonmayapti; чироқ ёнмаяпти' },
  { kind: 'maintenance', category: 'common_property', text: 'passage: сломана дверь окно крыша фасад общее имущество; umumiy mulk buzilgan; умумий мулк бузилган' },
  { kind: 'maintenance', category: 'cleaning', text: 'passage: грязно нужна уборка в подъезде; tozalash kerak iflos; тозалаш керак ифлос' },
  { kind: 'navigation', intent: 'rental_publish', text: 'passage: хочу сдать квартиру разместить объявление; kvartirani ijaraga bermoqchiman; квартирани ижарага бермоқчиман' },
  { kind: 'navigation', intent: 'rental_browse', text: 'passage: ищу квартиру снять жилье; ijaraga kvartira qidiryapman; ижарага квартира қидиряпман' },
  { kind: 'navigation', intent: 'useful_contacts', text: 'passage: нужен мастер сантехник электрик химчистка услуга; usta xizmat kerak; уста хизмат керак' },
  { kind: 'navigation', intent: 'marketplace', text: 'passage: хочу купить товар лампочку заказать в маркете; mahsulot sotib olmoqchiman; маҳсулот сотиб олмоқчиман' },
  { kind: 'navigation', intent: 'vehicle_owner', text: 'passage: найти владельца машины по номеру чей автомобиль; mashina egasini topish; машина эгасини топиш' },
  { kind: 'navigation', intent: 'guest_pass', text: 'passage: оформить пропуск гостю курьеру разрешить въезд; mehmon uchun ruxsatnoma; меҳмон учун рухсатнома' },
  { kind: 'navigation', intent: 'qr_scan', text: 'passage: проверить отсканировать QR пропуск охране; QR kodni tekshirish; QR кодни текшириш' },
  { kind: 'navigation', intent: 'vehicle_menu', text: 'passage: автомобиль машина мои автомобили раздел авто; avtomobil mashina; автомобиль машина' },
  { kind: 'navigation', intent: 'pass_menu', text: 'passage: пропуск доступ гость QR меню; ruxsatnoma mehmon QR; рухсатнома меҳмон QR' },
  { kind: 'navigation', intent: 'rental_menu', text: 'passage: квартира аренда жилье раздел; kvartira ijara; квартира ижара' },
  { kind: 'navigation', intent: 'parking_issue', text: 'passage: чужая машина мешает перекрыла выезд неправильная парковка; begona mashina yo‘lni to‘sdi; бегона машина йўлни тўсди' },
  { kind: 'navigation', intent: 'barrier_issue', text: 'passage: охрана не отвечает шлагбаум закрыт не могу въехать; qorovul javob bermayapti kira olmayapman; қўриқчи жавоб бермаяпти кира олмаяпман' },
  { kind: 'navigation', intent: 'resident_proposal', text: 'passage: предлагаю улучшить двор установить камеры идея для дома; hovlini yaxshilashni taklif qilaman; ҳовлини яхшилашни таклиф қиламан' },
  { kind: 'navigation', intent: 'assistant_help', text: 'passage: что умеет бот помоги найти раздел; bot nima qiladi yordam; бот нима қилади ёрдам' },
  { kind: 'none', text: 'passage: привет как дела спасибо кто смотрел футбол погода поздравление шутка реклама; salom rahmat futbol ob-havo; салом раҳмат футбол об-ҳаво' },
  { kind: 'navigation', intent: 'barrier_issue', text: 'passage: Қўриқчи телефонга жавоб бермаяпти. Дарвоза ёпиқ, уйга киролмаяпман.' },
  { kind: 'navigation', intent: 'barrier_issue', text: 'passage: Qorovul javob bermayapti. Darvoza yopiq, uyga kira olmayapman.' },
  { kind: 'navigation', intent: 'barrier_issue', text: 'passage: Дежурный не отвечает. Ворота закрыты, я не могу попасть домой.' },
  { kind: 'navigation', intent: 'parking_issue', text: 'passage: Бегона машина йўлни тўсиб қўйган, чиқиб бўлмаяпти.' },
  { kind: 'navigation', intent: 'resident_proposal', text: 'passage: Ҳовлига камера ўрнатишни ва киришни яхшилашни таклиф қиламан.' },
  { kind: 'navigation', intent: 'vehicle_owner', text: 'passage: Бу машина кимники? Рақами бўйича эгасини топиш керак.' },
  { kind: 'navigation', intent: 'guest_pass', text: 'passage: Меҳмон ва курьер учун кириш рухсатномаси керак.' },
  { kind: 'navigation', intent: 'rental_publish', text: 'passage: Квартирамни ижарага бермоқчиман, эълон жойлаш керак.' },
  { kind: 'navigation', intent: 'rental_browse', text: 'passage: Ижарага квартира қидиряпман, уй керак.' },
  { kind: 'maintenance', category: 'leak', text: 'passage: Қувурдан сув оқяпти, уйни сув босди.' },
  { kind: 'maintenance', category: 'sewage', text: 'passage: Канализация тиқилиб қолган, ёмон ҳид келяпти.' },
  { kind: 'maintenance', category: 'electricity', text: 'passage: Электр ўчган, симлардан учқун чиқяпти.' },
  { kind: 'maintenance', category: 'elevator', text: 'passage: Лифт ишламаяпти, одам ичида қолиб кетди.' },
  { kind: 'maintenance', category: 'heating', text: 'passage: Иситиш йўқ, батареялар совуқ.' },
  { kind: 'maintenance', category: 'garbage', text: 'passage: Чиқинди олиб кетилмаган, контейнер тўлиб кетган.' },
  { kind: 'maintenance', category: 'lighting', text: 'passage: Подъездда чироқ ёнмаяпти, жуда қоронғи.' },
  { kind: 'maintenance', category: 'cleaning', text: 'passage: Подъезд ифлос, тозалаш керак.' },
  { kind: 'maintenance', category: 'garbage', text: 'passage: Надо выбросить мусор. Нужно вынести мусор и убрать отходы.' },
  { kind: 'maintenance', category: 'lighting', text: 'passage: Assalomu aleykum. Dom, podezd va etajdagi lampochkasi kuygan. Tuzatib bera olasizlarmi, iltimos.' },
  { kind: 'maintenance', category: 'lighting', text: 'passage: Podyezdda lampochka kuygan, chiroq yonmayapti. Almashtirib bering, iltimos.' },
];

const EMBEDDING_MODEL = 'qwen3-embedding:0.6b';
const EMBEDDING_DIMENSIONS = 128;
// Regenerate the checked-in vectors whenever prototype text changes. The
// fingerprint fails closed instead of mixing stale vectors with new labels.
const PROTOTYPE_FINGERPRINT = '519dc60d';

let activeRequests = 0;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const waiters: Array<() => void> = [];

function positiveInteger(raw: string | undefined, fallback: number, max: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : -1;
}

function prototypeFingerprint(): string {
  let hash = 2166136261;
  for (const char of AI_LISTENER_PROTOTYPES.map(item => item.text).join('\n')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function validVector(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === EMBEDDING_DIMENSIONS
    && value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function prototypeKey(prototype: Prototype): string {
  if (prototype.kind === 'navigation') return `navigation:${prototype.intent}`;
  if (prototype.kind === 'maintenance') return `maintenance:${prototype.category}`;
  return 'none';
}

async function acquireInferenceSlot(maxConcurrency: number): Promise<boolean> {
  if (activeRequests < maxConcurrency) {
    activeRequests++;
    return true;
  }
  // One bounded waiter preserves a pair of near-simultaneous resident
  // messages without allowing an unbounded queue to load the VPS.
  if (waiters.length >= 1) return false;
  await new Promise<void>(resolve => waiters.push(resolve));
  return true;
}

function releaseInferenceSlot(): void {
  activeRequests--;
  const next = waiters.shift();
  if (next) {
    // Reserve the released slot before waking the waiter, preventing a new
    // request from overtaking it and exceeding max concurrency.
    activeRequests++;
    next();
  }
}

async function embed(env: Env, input: string[], timeoutMs: number): Promise<number[][]> {
  const baseUrl = env.AI_LISTENER_URL || 'http://127.0.0.1:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      redirect: 'error',
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input,
        dimensions: EMBEDDING_DIMENSIONS,
        // Keep the small embedding model resident so the first message after
        // a quiet period is not lost to cold-start loading.
        keep_alive: '24h',
      }),
    });
    if (!response.ok) throw new Error(`local_ai_http_${response.status}`);
    const data = await response.json() as { embeddings?: unknown };
    if (!Array.isArray(data.embeddings)) throw new Error('local_ai_empty');
    const vectors = data.embeddings as unknown[];
    if (vectors.length !== input.length || vectors.some(vector => !validVector(vector))) {
      throw new Error('local_ai_invalid_embeddings');
    }
    return vectors as number[][];
  } finally {
    clearTimeout(timeout);
  }
}

export function getAiListenerMode(env: Env): 'off' | 'shadow' | 'active' {
  return env.AI_LISTENER_MODE === 'shadow' || env.AI_LISTENER_MODE === 'active'
    ? env.AI_LISTENER_MODE
    : 'off';
}

export async function classifyWithLocalAi(
  env: Env,
  text: string,
): Promise<LocalAiListenerResult | null> {
  if (getAiListenerMode(env) === 'off' || !text || text.length > 4000) return null;
  const baseUrl = env.AI_LISTENER_URL || 'http://127.0.0.1:11434';
  if (!isLoopbackUrl(baseUrl) || Date.now() < circuitOpenUntil) return null;
  if (prototypeFingerprint() !== PROTOTYPE_FINGERPRINT
    || prototypeVectors.length !== AI_LISTENER_PROTOTYPES.length
    || prototypeVectors.some(vector => !validVector(vector))) return null;

  const maxConcurrency = positiveInteger(env.AI_LISTENER_MAX_CONCURRENCY, 1, 2);
  if (!await acquireInferenceSlot(maxConcurrency)) return null;

  try {
    const timeoutMs = positiveInteger(env.AI_LISTENER_TIMEOUT_MS, 7000, 10_000);
    const [query] = await embed(env, [`query: ${text}`], timeoutMs);
    const bestByClass = new Map<string, { index: number; score: number }>();
    prototypeVectors.forEach((vector, index) => {
      const key = prototypeKey(AI_LISTENER_PROTOTYPES[index]);
      const score = cosine(query, vector);
      const previous = bestByClass.get(key);
      if (!previous || score > previous.score) bestByClass.set(key, { index, score });
    });
    const ranked = [...bestByClass.values()]
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const margin = best.score - (ranked[1]?.score ?? -1);
    const prototype = AI_LISTENER_PROTOTYPES[best.index];
    const lang = detectLanguage(text);

    consecutiveFailures = 0;
    // Similarity is not a calibrated probability. Require both a meaningful
    // absolute match and separation from the runner-up before taking action.
    if (best.score < 0.58 || margin < 0.015 || prototype.kind === 'none') {
      return {
        kind: 'none', confidence: Math.max(0, best.score),
        similarity: best.score, margin, lang,
      };
    }
    const confidence = Math.min(0.99, Math.max(0, 0.65 + margin * 3));
    if (prototype.kind === 'navigation') {
      return { kind: prototype.kind, intent: prototype.intent, confidence, similarity: best.score, margin, lang };
    }
    return { kind: prototype.kind, category: prototype.category, confidence, similarity: best.score, margin, lang };
  } catch {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      circuitOpenUntil = Date.now() + 60_000;
      consecutiveFailures = 0;
    }
    return null;
  } finally {
    releaseInferenceSlot();
  }
}

export function resetLocalAiListenerStateForTests(): void {
  activeRequests = 0;
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  waiters.length = 0;
}
