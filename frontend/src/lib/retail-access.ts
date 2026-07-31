import type { User, UserRole } from "@/lib/types";

const RETAIL_STAFF_ROLES: UserRole[] = ["owner", "manager", "call_center"];

/** Сотрудник рассрочки: клиенты и договоры. Платежи и инвесторы — только у руководителя. */
export function isRetailStaff(user: User | null | undefined): boolean {
  return Boolean(user && RETAIL_STAFF_ROLES.includes(user.role));
}

export function isRetailOwner(user: User | null | undefined): boolean {
  return user?.role === "owner";
}
