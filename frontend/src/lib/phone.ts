export const PHONE_PREFIX = "+7";

export function applyPhoneInput(current: string, next: string): string {
  if (next.length < PHONE_PREFIX.length) {
    return PHONE_PREFIX;
  }

  if (!next.startsWith("+")) {
    return ensurePhonePrefix(next);
  }

  if (!next.startsWith(PHONE_PREFIX)) {
    const digits = next.replace(/\D/g, "");
    if (digits.startsWith("7")) {
      return `+${digits}`;
    }
    if (digits.startsWith("8")) {
      return `+7${digits.slice(1)}`;
    }
    return `${PHONE_PREFIX}${digits}`;
  }

  return next;
}

export function ensurePhonePrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return PHONE_PREFIX;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return PHONE_PREFIX;
  }
  if (digits.startsWith("7")) {
    return `+${digits}`;
  }
  if (digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  return `${PHONE_PREFIX}${digits}`;
}

export function addOneMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}
