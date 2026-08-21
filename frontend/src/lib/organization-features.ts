import {
  DEFAULT_ORGANIZATION_FEATURES,
  type OrganizationFeatures,
  type User,
} from "@/lib/types";

export function getOrganizationFeatures(user: User | null | undefined): OrganizationFeatures {
  return user?.organization_features ?? DEFAULT_ORGANIZATION_FEATURES;
}

export function isCollectionStaff(user: User | null | undefined): boolean {
  return user?.role === "call_center";
}

export function canUseQuestionnaires(user: User | null | undefined): boolean {
  const role = user?.role?.toLowerCase();
  return role === "owner" || role === "manager" || role === "call_center";
}

export function legalHomePath(user: User | null | undefined): string {
  return isCollectionStaff(user) ? "/questionnaires" : "/";
}
