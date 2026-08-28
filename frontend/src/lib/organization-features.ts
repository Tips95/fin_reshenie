import {
  DEFAULT_ORGANIZATION_FEATURES,
  type CivilCaseExecutorOption,
  type OrganizationFeatures,
  type User,
} from "@/lib/types";

export function getOrganizationFeatures(user: User | null | undefined): OrganizationFeatures {
  return user?.organization_features ?? DEFAULT_ORGANIZATION_FEATURES;
}

export function isCollectionStaff(user: User | null | undefined): boolean {
  return user?.role === "call_center";
}

export function isCivilExecutor(user: User | null | undefined): boolean {
  return user?.role === "executor";
}

export function canUseQuestionnaires(user: User | null | undefined): boolean {
  const role = user?.role?.toLowerCase();
  return role === "owner" || role === "manager" || role === "call_center";
}

export function canUseCivilCases(user: User | null | undefined): boolean {
  const role = user?.role?.toLowerCase();
  return role === "owner" || role === "manager" || role === "executor";
}

export function canCreateCivilCase(user: User | null | undefined): boolean {
  const role = user?.role?.toLowerCase();
  return role === "owner" || role === "manager";
}

export function canUploadCivilClientDocuments(user: User | null | undefined): boolean {
  return canCreateCivilCase(user);
}

export function canUploadCivilPreparedDocuments(
  user: User | null | undefined,
  assignedExecutorId?: string | null,
): boolean {
  if (isCivilExecutor(user)) return true;
  return Boolean(user?.id && assignedExecutorId === user.id);
}

export function civilExecutorGroups(items: CivilCaseExecutorOption[]) {
  return {
    dedicated: items.filter((item) => item.role === "executor"),
    self: items.filter((item) => item.role === "owner" || item.role === "manager"),
  };
}

export function legalHomePath(user: User | null | undefined): string {
  if (isCivilExecutor(user)) return "/civil-cases";
  return isCollectionStaff(user) ? "/questionnaires" : "/";
}
