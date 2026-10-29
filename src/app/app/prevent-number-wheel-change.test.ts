import { describe, expect, it, vi } from "vitest";

import { preventNumberWheelChange } from "./prevent-number-wheel-change";

describe("preventNumberWheelChange", () => {
  it("desactiva la edición por rueda y libera el foco del importe", () => {
    const blur = vi.fn();

    preventNumberWheelChange({
      currentTarget: { blur },
    } as never);

    expect(blur).toHaveBeenCalledOnce();
  });
});
