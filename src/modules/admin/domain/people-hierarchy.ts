type Member = { id: string; name: string; deskId: string };
type ManagedDesk = { id: string; terms: { active: boolean; manager_id: string | null } };

/** Presentation only: memberships and economic records remain unchanged. */
export function peopleHierarchy<T extends Member>(people: readonly T[], desks: readonly ManagedDesk[]) {
  const members = new Map(people.map(person => [person.id, person]));
  const managers = new Map(desks.filter(desk => desk.terms.active).map(desk => [desk.id, desk.terms.manager_id]));
  const children = new Map<string | null, T[]>();
  for (const person of members.values()) {
    const manager = managers.get(person.deskId);
    const parent = manager && manager !== person.id && members.has(manager) ? manager : null;
    children.set(parent, [...(children.get(parent) ?? []), person]);
  }
  const compare = (a: T, b: T) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id);
  for (const group of children.values()) group.sort(compare);
  const result: { person: T; depth: number; parentName: string | null }[] = [];
  const visited = new Set<string>();
  function visit(person: T, depth: number, parentName: string | null) {
    if (visited.has(person.id)) return;
    visited.add(person.id);
    result.push({ person, depth, parentName });
    for (const child of children.get(person.id) ?? []) visit(child, depth + 1, person.name);
  }
  for (const person of children.get(null) ?? []) visit(person, 0, null);
  // Corrupt cycles must neither hide users nor hang the dashboard.
  for (const person of [...members.values()].sort(compare)) if (!visited.has(person.id)) visit(person, 0, null);
  return result;
}
