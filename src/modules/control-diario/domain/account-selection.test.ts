import { describe, expect, it } from "vitest";

import {
  OPERATION_PHASES,
  accountsForCompany,
  chooseLeader,
  toggleReplica,
} from "./account-selection";

const accounts = [
  { companyId: "lucid", id: "lucid-1", referenceNumber: 1 },
  { companyId: "fff", id: "fff-7", referenceNumber: 7 },
  { companyId: "fff", id: "fff-1", referenceNumber: 1 },
  { companyId: "fff", id: "fff-4", referenceNumber: 4 },
];

describe("seleccion de cuentas de Control Diario", () => {
  it("separa y ordena las cuentas de cada empresa", () => {
    expect(accountsForCompany(accounts, "fff").map((account) => account.id)).toEqual([
      "fff-1",
      "fff-4",
      "fff-7",
    ]);
    expect(accountsForCompany(accounts, "lucid").map((account) => account.id)).toEqual([
      "lucid-1",
    ]);
  });

  it("quita la nueva líder de las réplicas", () => {
    expect(chooseLeader("fff-4", ["fff-4", "fff-7"])).toEqual({
      leaderId: "fff-4",
      replicaIds: ["fff-7"],
    });
  });

  it("agrega y quita réplicas no consecutivas de forma explícita", () => {
    expect(toggleReplica("fff-1", [], "fff-4")).toEqual(["fff-4"]);
    expect(toggleReplica("fff-1", ["fff-4", "fff-7"], "fff-4")).toEqual([
      "fff-7",
    ]);
  });

  it("impide que la líder también sea réplica", () => {
    expect(() => toggleReplica("fff-1", [], "fff-1")).toThrow(
      "La cuenta líder no puede seleccionarse como réplica.",
    );
  });

  it("conserva exactamente las seis fases vigentes", () => {
    expect(OPERATION_PHASES).toEqual([
      "Evaluacion",
      "Primera vuelta",
      "Segunda vuelta",
      "Tercera vuelta",
      "Cuarta vuelta",
      "Quinta vuelta",
    ]);
  });
});
