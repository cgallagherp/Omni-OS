// Crew records agreed organisational actions only — never assessments of individuals.
export const ORG_ACTION_TYPES = [
  { value: "critical_role", label: "Critical role", plural: "Critical roles", hint: "Roles the plan depends on and how they will be covered." },
  { value: "hire", label: "Approved recruitment priority", plural: "Approved recruitment priorities", hint: "Hires agreed by the leadership team and Board." },
  { value: "structure", label: "Structure or dependency change", plural: "Structure & dependencies", hint: "Organisational structure changes and cross-functional dependencies." },
  { value: "capability", label: "Capability initiative", plural: "Capability initiatives", hint: "Agreed improvement actions to build organisational capability." },
] as const;
