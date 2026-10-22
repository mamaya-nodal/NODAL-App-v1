import { describe, expect, it } from "vitest";
import { peopleHierarchy } from "./people-hierarchy";

const desk = (id: string, manager_id: string, active = true) => ({ id, terms: { manager_id, active } });
const person = (id: string, name: string, deskId = "root") => ({ id, name, deskId });

describe("peopleHierarchy", () => {
  it("nests traders under their manager even when alphabetically before them", () => {
    const rows = peopleHierarchy([person("b", "Baltazar", "j"), person("j", "Julian"), person("a", "Ana")], [desk("j", "j")]);
    expect(rows.map(row => [row.person.id, row.depth])).toEqual([["a", 0], ["j", 0], ["b", 1]]);
    expect(rows[2].parentName).toBe("Julian");
  });
  it("keeps distinct registrations with the same name and deduplicates only UUID", () => {
    const a = person("a", "Baltazar");
    expect(peopleHierarchy([a, a, person("b", "Baltazar")], [])).toHaveLength(2);
  });
  it("supports nested administrators", () => {
    expect(peopleHierarchy([person("a", "A"), person("b", "B", "a"), person("c", "C", "b")], [desk("a", "a"), desk("b", "b")]).map(row => row.depth)).toEqual([0, 1, 2]);
  });
  it("handles absent managers, inactive desks and self membership", () => {
    expect(peopleHierarchy([person("a", "A", "a"), person("b", "B", "b"), person("c", "C", "c")], [desk("a", "a"), desk("b", "missing"), desk("c", "a", false)]).map(row => row.depth)).toEqual([0, 0, 0]);
  });
  it("terminates cycles without hiding users", () => {
    const rows = peopleHierarchy([person("a", "A", "b"), person("b", "B", "a")], [desk("a", "a"), desk("b", "b")]);
    expect(new Set(rows.map(row => row.person.id)).size).toBe(2);
  });
});
