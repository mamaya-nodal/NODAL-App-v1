import type { NinjaAccountChange, NewNinjaAccount, TrackedNinjaAccount } from "./account-transition-engine";
import { detectNinjaAccountChanges, observeTrackedNinjaAccount, startTrackingNinjaAccount } from "./account-transition-engine";

export type NinjaTransitionLife = Readonly<{
  connectionName: string;
  lifeId: string;
  status: "active" | "burned" | "missing";
  tracked: TrackedNinjaAccount;
}>;

export type NinjaTransitionState = Readonly<{ lives: readonly NinjaTransitionLife[] }>;
export type NinjaTransitionObservation = Readonly<NewNinjaAccount & {
  balanceStatus: "verified" | "conflict" | "missing";
  connectionName: string;
}>;
export type PersistableNinjaChange = NinjaAccountChange & Readonly<{
  connectionName: string;
  fromLifeId: string | null;
  toLifeId: string | null;
}>;

export function evolveNinjaTransitionState(args: Readonly<{
  businessDate: string;
  connectedNames: readonly string[];
  createLifeId: () => string;
  observations: readonly NinjaTransitionObservation[];
  state: NinjaTransitionState;
}>): Readonly<{ changes: readonly PersistableNinjaChange[]; state: NinjaTransitionState }> {
  let lives = [...args.state.lives];
  const changes: PersistableNinjaChange[] = [];

  for (const connectionName of [...new Set(args.connectedNames)].sort()) {
    const observations = args.observations.filter((item) => item.connectionName === connectionName);
    const observationByName = new Map(observations.map((item) => [item.externalAccountName, item]));
    const connectionLives = lives.filter((life) => life.connectionName === connectionName);
    const newlyMissing = new Set<string>();

    lives = lives.map((life) => {
      if (life.connectionName !== connectionName) return life;
      const observation = observationByName.get(life.tracked.externalAccountName);
      if (life.status === "burned") {
        if (!observation) return { ...life, status: "missing" as const };
        if (observation.balanceStatus !== "verified"
          || observation.balanceInCents <= life.tracked.burnFloorInCents) return life;
        const tracked = observeTrackedNinjaAccount(life.tracked, observation.balanceInCents, args.businessDate);
        changes.push({
          automatic: true,
          connectionName,
          fromAccountName: tracked.externalAccountName,
          fromLifeId: life.lifeId,
          kind: "burn_reversed",
          reason: "NinjaTrader volvió a informar la misma cuenta activa y por encima del piso; se revirtió la quema automática anterior.",
          toAccountName: null,
          toLifeId: null,
        });
        return { ...life, status: "active" as const, tracked };
      }
      if (life.status !== "active") return life;
      if (!observation) {
        newlyMissing.add(life.lifeId);
        return { ...life, status: "missing" as const };
      }
      if (observation.balanceStatus !== "verified") return life;
      const tracked = observeTrackedNinjaAccount(life.tracked, observation.balanceInCents, args.businessDate);
      if (tracked.balanceInCents <= tracked.burnFloorInCents) {
        changes.push({
          automatic: true,
          connectionName,
          fromAccountName: tracked.externalAccountName,
          fromLifeId: life.lifeId,
          kind: "burned",
          reason: "El saldo de la cuenta alcanzó su piso de quema vigente.",
          toAccountName: null,
          toLifeId: null,
        });
        return { ...life, status: "burned" as const, tracked };
      }
      return { ...life, tracked };
    });

    const activeNames = new Set(lives.filter((life) =>
      life.connectionName === connectionName && life.status !== "missing",
    ).map((life) => life.tracked.externalAccountName));
    const appeared = observations.filter((item) => item.balanceStatus === "verified" && !activeNames.has(item.externalAccountName));
    const missingLives = lives.filter((life) => life.connectionName === connectionName && life.status === "missing");
    const candidates = appeared.length ? missingLives : missingLives.filter((life) => newlyMissing.has(life.lifeId));
    const detected = detectNinjaAccountChanges(candidates.map((life) => life.tracked), appeared);

    for (const change of detected) {
      const fromLife = change.fromAccountName
        ? missingLives.find((life) => life.tracked.externalAccountName === change.fromAccountName) ?? null
        : null;
      let toLifeId: string | null = null;

      if (["burned", "evaluation_to_funded", "reset", "reset_after_burn", "funded_to_live_review"].includes(change.kind) && fromLife) {
        lives = lives.filter((life) => life.lifeId !== fromLife.lifeId);
      }
      if (change.toAccountName) {
        const observation = appeared.find((item) => item.externalAccountName === change.toAccountName);
        if (observation) {
          toLifeId = args.createLifeId();
          lives.push({ connectionName, lifeId: toLifeId, status: "active", tracked: startTrackingNinjaAccount(observation, args.businessDate) });
        }
      }
      changes.push({ ...change, connectionName, fromLifeId: fromLife?.lifeId ?? null, toLifeId });
    }

    for (const observation of observations.filter((item) => item.balanceStatus !== "verified" && !connectionLives.some((life) => life.tracked.externalAccountName === item.externalAccountName))) {
      changes.push({
        automatic: false,
        connectionName,
        fromAccountName: null,
        fromLifeId: null,
        kind: "review_disappearance",
        reason: "CashValue y NetLiquidation no ofrecen un saldo coincidente; NODAL no automatizó la cuenta.",
        toAccountName: observation.externalAccountName,
        toLifeId: null,
      });
    }
  }

  return { changes, state: { lives } };
}
