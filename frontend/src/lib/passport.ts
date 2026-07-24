export const PASSPORT_PLACEHOLDER = "00 00 000000";

export function passportDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function formatPassport(value: string): string {
  const digits = passportDigits(value);
  if (!digits) return "";
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 4);
  const part3 = digits.slice(4, 10);
  if (digits.length <= 2) return part1;
  if (digits.length <= 4) return `${part1} ${part2}`;
  return `${part1} ${part2} ${part3}`;
}

export function applyPassportInput(_current: string, next: string): string {
  return formatPassport(next);
}

export function isPassportComplete(value: string): boolean {
  return passportDigits(value).length === 10;
}
