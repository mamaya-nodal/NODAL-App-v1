import { describe, expect, it } from "vitest";

import {
  detectNinjaAccountChanges,
  observeTrackedNinjaAccount,
  startTrackingNinjaAccount,
  type NewNinjaAccount,
} from "./account-transition-engine";

function account(externalAccountName: string, phase: NewNinjaAccount["phase"], balance = 50_000, companyCode = "LUCID"): NewNinjaAccount {
  return { accountSizeInCents: 5_000_000, balanceInCents: balance * 100, companyCode, externalAccountName, phase, product: "Flex" };
}

describe("pisos y objetivos del seguimiento Ninja", () => {
  it("mueve el piso de evaluación solo al comenzar otra jornada y nunca lo baja", () => {
    let tracked = startTrackingNinjaAccount(account("LFE1", "Evaluation"), "2026-08-24");
    tracked = observeTrackedNinjaAccount(tracked, 5_070_000, "2026-08-24");
    expect(tracked.burnFloorInCents).toBe(4_800_000);

    tracked = observeTrackedNinjaAccount(tracked, 5_030_000, "2026-08-25");
    expect(tracked.burnFloorInCents).toBe(4_870_000);

    tracked = observeTrackedNinjaAccount(tracked, 4_970_000, "2026-08-26");
    expect(tracked.burnFloorInCents).toBe(4_870_000);
  });

  it("recuerda que una evaluación alcanzó US$53.001 aunque luego baje", () => {
    let tracked = startTrackingNinjaAccount(account("LFE1", "Evaluation"), "2026-08-24");
    tracked = observeTrackedNinjaAccount(tracked, 5_300_100, "2026-08-24");
    tracked = observeTrackedNinjaAccount(tracked, 5_250_000, "2026-08-24");
    expect(tracked.reachedEvaluationTarget).toBe(true);
  });

  it("aplica el umbral funded común y la excepción Topstep en tiempo real", () => {
    let lucid = startTrackingNinjaAccount(account("LFF1", "Funded"), "2026-08-24");
    lucid = observeTrackedNinjaAccount(lucid, 5_209_900, "2026-08-24");
    expect(lucid.burnFloorInCents).toBe(4_800_000);
    lucid = observeTrackedNinjaAccount(lucid, 5_210_000, "2026-08-24");
    expect(lucid.burnFloorInCents).toBe(5_010_000);

    let topstep = startTrackingNinjaAccount(account("EXPRESS-1", "Funded", 50_000, "TOPSTEP"), "2026-08-24");
    topstep = observeTrackedNinjaAccount(topstep, 5_200_000, "2026-08-24");
    expect(topstep.burnFloorInCents).toBe(5_010_000);
  });

  it("no mezcla vidas de programas con distinto tamaño", () => {
    const evaluation = startTrackingNinjaAccount(account("LFE1", "Evaluation", 53_001), "2026-08-24");
    const funded = { ...account("LFF1", "Funded"), accountSizeInCents: 10_000_000 };
    expect(detectNinjaAccountChanges([evaluation], [funded]).map((change) => change.kind)).toEqual([
      "review_disappearance",
      "new_account",
    ]);
  });
});
describe("cambios de inventario Ninja", () => {
  it("resuelve el ejemplo de cinco evaluaciones: tres pasan y dos se queman", () => {
    const old = [1, 2, 3, 4, 5].map((number) => startTrackingNinjaAccount(account(`LFE${number}`, "Evaluation"), "2026-08-24"));
    const disappeared = old.map((item, index) => observeTrackedNinjaAccount(item, index < 3 ? 5_300_100 : 4_800_000, "2026-08-24"));
    const appeared = [1, 2, 3].map((number) => account(`LFF${number}`, "Funded"));

    const changes = detectNinjaAccountChanges(disappeared, appeared);
    expect(changes.filter((change) => change.kind === "evaluation_to_funded")).toHaveLength(3);
    expect(changes.filter((change) => change.kind === "burned")).toHaveLength(2);
    expect(changes.every((change) => change.automatic)).toBe(true);
  });

  it("crea una vida nueva al detectar un reset de evaluación", () => {
    const prior = observeTrackedNinjaAccount(
      startTrackingNinjaAccount(account("LFE05088021070001", "Evaluation"), "2026-08-24"),
      5_150_000,
      "2026-08-24",
    );
    expect(detectNinjaAccountChanges([prior], [account("LFE05088021070001", "Evaluation")])).toMatchObject([
      { automatic: true, kind: "reset", fromAccountName: "LFE05088021070001", toAccountName: "LFE05088021070001" },
    ]);
  });

  it("distingue un reset posterior a una quema", () => {
    const prior = observeTrackedNinjaAccount(
      startTrackingNinjaAccount(account("LFE1", "Evaluation"), "2026-08-24"),
      4_800_000,
      "2026-08-24",
    );
    expect(detectNinjaAccountChanges([prior], [account("LFE1", "Evaluation")])[0].kind).toBe("reset_after_burn");
  });

  it("exige confirmación humana para funded a live", () => {
    const funded = startTrackingNinjaAccount(account("LFF1", "Funded"), "2026-08-24");
    expect(detectNinjaAccountChanges([funded], [account("LFL1", "Live")])).toMatchObject([
      { automatic: false, kind: "funded_to_live_review" },
    ]);
  });

  it("no inventa el motivo de una desaparición o de una Live sin origen", () => {
    const evaluation = observeTrackedNinjaAccount(
      startTrackingNinjaAccount(account("LFE1", "Evaluation"), "2026-08-24"),
      5_150_000,
      "2026-08-24",
    );
    const changes = detectNinjaAccountChanges([evaluation], [account("LFL9", "Live")]);
    expect(changes.map((change) => [change.kind, change.automatic])).toEqual([
      ["review_disappearance", false],
      ["new_account", false],
    ]);
  });
});
