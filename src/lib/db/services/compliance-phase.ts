const ALL_ROLE_CODES = ["A", "C", "D", "P"] as const;

const normaliseRoles = (activeRoles: string | null): string[] =>
  (activeRoles ?? "")
    .split(",")
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean)
    .filter((role, index, roles) => roles.indexOf(role) === index)
    .sort();

/**
 * Returns the canonical compliance phase followed by any historical aliases
 * that represent the same set of active roles.
 */
export function getCompliancePhaseIdentifiers(
  leagueStatus: string,
  activeRoles: string | null
): string[] {
  const roles = normaliseRoles(activeRoles);
  const usesAllRolesLabel = roles.length === 0 || roles.includes("ALL");
  const currentSuffix = usesAllRolesLabel
    ? "ALL_ROLES"
    : roles.join(",");
  const representsAllRoles =
    usesAllRolesLabel ||
    (roles.length === ALL_ROLE_CODES.length &&
      ALL_ROLE_CODES.every((role) => roles.includes(role)));

  if (!representsAllRoles) {
    return [`${leagueStatus}_${currentSuffix}`];
  }

  const equivalentSuffix =
    currentSuffix === "ALL_ROLES"
      ? ALL_ROLE_CODES.join(",")
      : "ALL_ROLES";

  return [
    `${leagueStatus}_${currentSuffix}`,
    `${leagueStatus}_${equivalentSuffix}`,
  ];
}

export function getCurrentPhaseIdentifier(
  leagueStatus: string,
  activeRoles: string | null
): string {
  return getCompliancePhaseIdentifiers(leagueStatus, activeRoles)[0];
}
