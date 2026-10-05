export const ADMINISTRATION_DESIGN_DEMO_OWNER = "mauriciosebastianamaya@gmail.com";

export function canAccessAdministrationDesignDemo(email: string | null | undefined) {
  return email?.trim().toLowerCase() === ADMINISTRATION_DESIGN_DEMO_OWNER;
}
