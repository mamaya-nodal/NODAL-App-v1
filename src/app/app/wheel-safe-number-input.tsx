"use client";

import type { InputHTMLAttributes } from "react";

import { preventNumberWheelChange } from "./prevent-number-wheel-change";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onWheel" | "type">;

/** Campo numérico cliente: la rueda desplaza la página y no altera el valor. */
export function WheelSafeNumberInput(props: Props) {
  return <input {...props} onWheel={preventNumberWheelChange} type="number" />;
}
