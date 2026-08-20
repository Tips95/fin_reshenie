import {
  DEFAULT_ORGANIZATION_FEATURES,
  type OrganizationFeatures,
  type User,
} from "@/lib/types";

export function getOrganizationFeatures(user: User | null | undefined): OrganizationFeatures {
  return user?.organization_features ?? DEFAULT_ORGANIZATION_FEATURES;
}

export function canUseQuestionnaires(user: User | null | undefined): boolean {
  const role = user?.role?.toLowerCase();
  return role === "owner" || role === "manager";
}
