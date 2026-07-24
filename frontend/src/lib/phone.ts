export const PHONE_PREFIX = "+7";

export function applyPhoneInput(_current: string, next: string): string {
  if (next.length < PHONE_PREFIX.length) {
    return PHONE_PREFIX;
  }

  if (!next.startsWith("+")) {
    return limitPhoneLength(ensurePhonePrefix(next));
  }

  if (!next.startsWith(PHONE_PREFIX)) {
    return limitPhoneLength(ensurePhonePrefix(next));
  }

  const digits = next.slice(PHONE_PREFIX.length).replace(/\D/g, "").slice(0, 10);
  return digits ? `${PHONE_PREFIX}${digits}` : PHONE_PREFIX;
}

function limitPhoneLength(value: string): string {
  if (!value.startsWith(PHONE_PREFIX)) {
    return PHONE_PREFIX;
  }
  const digits = value.slice(PHONE_PREFIX.length).replace(/\D/g, "").slice(0, 10);
  return digits ? `${PHONE_PREFIX}${digits}` : PHONE_PREFIX;
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
    return limitPhoneLength(`+${digits}`);
  }
  if (digits.startsWith("8")) {
    return limitPhoneLength(`${PHONE_PREFIX}${digits.slice(1)}`);
  }
  return limitPhoneLength(`${PHONE_PREFIX}${digits}`);
}

export function addOneMonth(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}
