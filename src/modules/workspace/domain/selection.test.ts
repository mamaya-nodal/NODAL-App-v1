import { describe, expect, it } from "vitest";

import { formatPeriodLabel, resolveWorkspaceSelection } from "./selection";

const workspaces = [
  {
    id: "practice-space",
    modality: "practice" as const,
    periods: [{ id: "practice-aug", periodMonth: "2026-08-01" }],
  },
  {
    id: "real-space",
    modality: "real" as const,
    periods: [
      { id: "real-jul", periodMonth: "2026-07-01" },
      { id: "real-aug", periodMonth: "2026-08-01" },
    ],
  },
];

describe("resolveWorkspaceSelection", () => {
  it("usa Real y el periodo mas reciente como seleccion segura", () => {
    const selection = resolveWorkspaceSelection(workspaces, undefined, undefined);

    expect(selection?.workspace.modality).toBe("real");
    expect(selection?.period?.periodMonth).toBe("2026-08-01");
  });

  it("respeta una modalidad y un periodo existentes", () => {
    const selection = resolveWorkspaceSelection(
      workspaces,
      "practice",
      "2026-08-01",
    );

    expect(selection?.workspace.id).toBe("practice-space");
    expect(selection?.period?.id).toBe("practice-aug");
  });

  it("ignora selecciones manipuladas que no pertenecen al espacio", () => {
    const selection = resolveWorkspaceSelection(
      workspaces,
      "practice",
      "2026-07-01",
    );

    expect(selection?.period?.id).toBe("practice-aug");
  });

  it("elige el período abierto aunque el siguiente ya esté programado", () => {
    const selection = resolveWorkspaceSelection([{
      id: "real-space",
      modality: "real",
      periods: [
        { id: "september", lifecycleStatus: "open", periodMonth: "2026-09-01" },
        { id: "october", lifecycleStatus: "scheduled", periodMonth: "2026-10-01" },
      ],
    }], undefined, undefined);

    expect(selection?.period?.id).toBe("september");
  });

  it("no crea una seleccion si el usuario no posee espacios", () => {
    expect(resolveWorkspaceSelection([], "real", "2026-08-01")).toBeNull();
  });
});

describe("formatPeriodLabel", () => {
  it("presenta el mes en lenguaje claro", () => {
    expect(formatPeriodLabel("2026-08-01")).toBe("agosto de 2026");
  });
});
