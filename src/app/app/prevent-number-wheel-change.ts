import type { WheelEvent } from "react";

/**
 * Los campos numéricos nativos cambian su valor cuando reciben la rueda del
 * mouse con foco. En importes contables, la rueda debe seguir desplazando la
 * pantalla y nunca editar el dato silenciosamente.
 */
export function preventNumberWheelChange(event: WheelEvent<HTMLInputElement>) {
  event.currentTarget.blur();
}
