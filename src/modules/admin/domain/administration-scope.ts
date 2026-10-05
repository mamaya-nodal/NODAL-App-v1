export type AdministrationScope =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "master" }>
  | Readonly<{ kind: "preview" }>
  | Readonly<{ deskId: string; deskName: string; kind: "desk" }>
  | Readonly<{ deskId: string; deskName: string; kind: "combined" }>;

export type AdministrationScopeRow = Readonly<{
  desk_id: string | null;
  desk_name: string | null;
  scope: string;
}>;

export function visibleAdministrationScope(
  accessRole: string | null | undefined,
  protectedScope: AdministrationScope,
): AdministrationScope {
  // La entrada al panel debe ser visible para un administrador activo aunque
  // su sesión todavía sea AAL1. La ruta administrativa exige AAL2 y deriva al
  // desafío MFA antes de entregar cualquier dato o acción protegida.
  if (accessRole === "admin" && protectedScope.kind === "desk") {
    return { ...protectedScope, kind: "combined" };
  }
  if (accessRole === "admin" && protectedScope.kind === "none") {
    return { kind: "master" };
  }
  return protectedScope;
}

export function canOpenDeskAdmin(scope: AdministrationScope): boolean {
  return scope.kind === "desk" || scope.kind === "combined" || scope.kind === "preview";
}

export function canOpenMasterAdmin(scope: AdministrationScope): boolean {
  return scope.kind === "master" || scope.kind === "combined" || scope.kind === "preview";
}

export function parseAdministrationScope(
  row: AdministrationScopeRow | null | undefined,
): AdministrationScope {
  if (row?.scope === "master") return { kind: "master" };
  if (row?.scope === "master_preview") return { kind: "preview" };
  if (
    (row?.scope === "desk" || row?.scope === "combined")
    && typeof row.desk_id === "string"
    && row.desk_id.length > 0
    && typeof row.desk_name === "string"
    && row.desk_name.trim().length > 0
  ) {
    return {
      deskId: row.desk_id,
      deskName: row.desk_name.trim(),
      kind: row.scope,
    };
  }
  return { kind: "none" };
}

