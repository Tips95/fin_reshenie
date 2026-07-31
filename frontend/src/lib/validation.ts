import { PHONE_PREFIX, ensurePhonePrefix } from "@/lib/phone";
import { applyPassportInput, formatPassport, isPassportComplete, PASSPORT_PLACEHOLDER } from "@/lib/passport";

const FULL_NAME_RE = /^[\u0401\u0451\u0410-\u044fa-zA-Z\s\-']+$/;

export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    return `7${digits.slice(1)}`;
  }
  if (digits.startsWith("7")) {
    return digits;
  }
  return `7${digits}`;
}

export function validatePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === PHONE_PREFIX) {
    return "Укажите полный номер телефона";
  }
  if (!trimmed.startsWith("+7")) {
    return "Номер должен начинаться с +7";
  }
  const digits = phoneDigits(trimmed);
  if (digits.length < 11) {
    return "Укажите полный номер телефона (10 цифр после +7)";
  }
  if (digits.length > 11) {
    return "Слишком длинный номер телефона";
  }
  return null;
}

export function validatePhoneOptional(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === PHONE_PREFIX) {
    return null;
  }
  return validatePhone(trimmed);
}

export function validateFullName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3) {
    return "Укажите фамилию и имя";
  }
  if (/\d/.test(normalized)) {
    return "ФИО не должно содержать цифры";
  }
  if (normalized.split(" ").filter(Boolean).length < 2) {
    return "Укажите фамилию и имя";
  }
  if (!FULL_NAME_RE.test(normalized)) {
    return "ФИО: только буквы, пробелы и дефис";
  }
  return null;
}

export function validateEmail(value: string, required = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return required ? "Укажите email" : null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Некорректный email";
  }
  return null;
}

export function validateLogin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Укажите email или телефон";
  }
  if (trimmed.includes("@")) {
    return validateEmail(trimmed, true);
  }
  if (/^[\d+\s()-]+$/.test(trimmed) || trimmed.startsWith("+")) {
    return validatePhone(ensurePhonePrefix(trimmed));
  }
  return "Введите email или номер телефона (+7...)";
}

/** Приводит введённый логин к виду, который ждёт бэкенд: email как есть, телефон в +7XXXXXXXXXX. */
export function normalizeLoginValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@") || !/^[\d+\s()-]+$/.test(trimmed) || trimmed.startsWith("+")) {
    return trimmed;
  }
  return `${PHONE_PREFIX}${trimmed.replace(/\D/g, "").replace(/^7/, "").slice(0, 10)}`;
}

export function validatePassport(value: string): string | null {
  if (!isPassportComplete(value)) {
    return "Паспорт: укажите серию и номер (формат 00 00 000000)";
  }
  return null;
}

export function validateAddress(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 5) {
    return "Укажите адрес (не короче 5 символов)";
  }
  if (/^\d+$/.test(normalized)) {
    return "Адрес не может состоять только из цифр";
  }
  return null;
}

export function validateRequiredDate(value: string): string | null {
  if (!value.trim()) {
    return "Укажите дату";
  }
  return null;
}

export function validatePositiveAmount(
  value: string,
  options: { allowZero?: boolean; label?: string } = {},
): string | null {
  const { allowZero = false, label = "Сумма" } = options;
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return `Укажите ${label.toLowerCase()}`;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return `${label} должна быть числом (до 2 знаков после запятой)`;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return `${label} должна быть числом`;
  }
  if (allowZero) {
    if (num < 0) {
      return `${label} не может быть отрицательной`;
    }
    return null;
  }
  if (num <= 0) {
    return `${label} должна быть больше нуля`;
  }
  return null;
}

export function validatePassword(value: string, minLength = 6): string | null {
  if (value.length < minLength) {
    return `Пароль: минимум ${minLength} символов`;
  }
  return null;
}

export function validateIntegerInRange(
  value: string,
  options: { min: number; max: number; label?: string },
): string | null {
  const { min, max, label = "Значение" } = options;
  const trimmed = value.trim();
  if (!trimmed) {
    return `Укажите ${label.toLowerCase()}`;
  }
  if (!/^\d+$/.test(trimmed)) {
    return `${label} должно быть целым числом`;
  }
  const num = Number(trimmed);
  if (num < min || num > max) {
    return `${label}: от ${min} до ${max}`;
  }
  return null;
}

export function filterPersonName(value: string): string {
  return value.replace(/[^\u0401\u0451\u0410-\u044fa-zA-Z\s\-']/g, "");
}

export function filterPassportInput(value: string): string {
  return applyPassportInput("", value);
}

export { formatPassport, PASSPORT_PLACEHOLDER };

export function filterDecimalInput(value: string): string {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole, ...rest] = normalized.split(".");
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

export function collectErrors(fields: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

export function hasErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0;
}

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

export function validatePdfFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "Допустим только файл PDF";
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return "Файл слишком большой (максимум 10 МБ)";
  }
  return null;
}
