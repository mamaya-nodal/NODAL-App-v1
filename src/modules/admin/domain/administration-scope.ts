export type AdministrationScope =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "master" }>
  | Readonly<{ deskId: string; deskName: string; kind: "desk" }>;

export type AdministrationScopeRow = Readonly<{
  desk_id: string | null;
  desk_name: string | null;
  scope: string;
}>;

export function parseAdministrationScope(
  row: AdministrationScopeRow | null | undefined,
): AdministrationScope {
  if (row?.scope === "master") return { kind: "master" };
  if (
    row?.scope === "desk"
    && typeof row.desk_id === "string"
    && row.desk_id.length > 0
    && typeof row.desk_name === "string"
    && row.desk_name.trim().length > 0
  ) {
    return {
      deskId: row.desk_id,
      deskName: row.desk_name.trim(),
      kind: "desk",
    };
  }
  return { kind: "none" };
}

