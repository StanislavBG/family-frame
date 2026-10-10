export const MAX_HOSTED_PERSON_IDS = 20;

export function togglePersonId(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= MAX_HOSTED_PERSON_IDS) return ids;
  return [...ids, id];
}

export function hostedStreamLabel(
  scope: "household" | "people" | undefined,
  personIds: string[] | undefined,
  people: { id: string; name: string }[],
): string {
  if (scope !== "people") return "Whole household";
  const names = (personIds ?? [])
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return "No one chosen";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} people`;
}
