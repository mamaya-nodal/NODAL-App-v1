export const CONTROL_ORIGIN_DESTINATIONS = [
  "Aporte trader",
  "Saldo billetera",
  "Retiro personal",
] as const;

export type ControlOriginDestination =
  (typeof CONTROL_ORIGIN_DESTINATIONS)[number];
