import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ effect: undefined as undefined | (() => void | (() => void)), dismiss: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: () => [false, hooks.dismiss],
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
}));
import { PurchaseFeedback } from "./purchase-feedback";

describe("purchase confirmation", () => {
  const replaceState = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      setTimeout, clearTimeout,
      location: { href: "https://nodal.test/app?mode=real&purchase_result=created#cuentas" },
      history: { state: { existing: true }, replaceState },
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("dismisses success after five seconds and preserves navigation parameters", () => {
    PurchaseFeedback({ message: "Compra confirmada", success: true });
    hooks.effect!();
    vi.advanceTimersByTime(4999);
    expect(hooks.dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(hooks.dismiss).toHaveBeenCalledWith(true);
    expect(replaceState).toHaveBeenCalledWith({ existing: true }, "", "/app?mode=real#cuentas");
  });
  it("does not dismiss errors", () => {
    PurchaseFeedback({ message: "No se pudo registrar", success: false });
    hooks.effect!();
    vi.advanceTimersByTime(10000);
    expect(hooks.dismiss).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });
  it("cancels the timer when unmounted", () => {
    PurchaseFeedback({ message: "Compra confirmada", success: true });
    const cleanup = hooks.effect!();
    if (cleanup) cleanup();
    vi.advanceTimersByTime(5000);
    expect(hooks.dismiss).not.toHaveBeenCalled();
  });
});
