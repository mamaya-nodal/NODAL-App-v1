import { describe, expect, it } from "vitest";

import type { WalletMovement } from "@/modules/summary/domain/operational-summary";
import { buildWalletMovementHistoryCsv, orderWalletMovementHistory } from "./movement-history";

const movement = (input: Partial<WalletMovement> & Pick<WalletMovement, "id" | "occurredOn">): WalletMovement => ({
  amountInCents: 100,
  kind: "external_contribution",
  observation: null,
  walletId: "wallet",
  ...input,
});

describe("wallet movement history", () => {
  it("orders every movement by business date and then creation time descending", () => {
    const ordered = orderWalletMovementHistory([
      movement({ createdAt: "2026-10-15T12:00:00Z", id: "middle", occurredOn: "2026-10-15" }),
      movement({ createdAt: "2026-10-14T18:00:00Z", id: "old", occurredOn: "2026-10-14" }),
      movement({ createdAt: "2026-10-15T13:00:00Z", id: "new", occurredOn: "2026-10-15" }),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["new", "middle", "old"]);
  });

  it("exports the complete ordered and traceable history", () => {
    const csv = buildWalletMovementHistoryCsv({
      labels: { external_contribution: "Aporte externo a billetera" },
      movements: [
        movement({ id: "old", occurredOn: "2026-10-14" }),
        movement({ amountInCents: 473_100, createdAt: "2026-10-15T13:00:00Z", id: "new", observation: "Cobranza, sala", occurredOn: "2026-10-15", periodLabel: "Octubre 2026" }),
      ],
      walletNames: { wallet: "Metamask Alf" },
    });

    expect(csv).toContain('"Fecha","Período","Registrado","Billetera/cuenta bancaria origen"');
    expect(csv.indexOf('"new"')).toBeLessThan(csv.indexOf('"old"'));
    expect(csv).toContain('"4731.00"');
    expect(csv).toContain('"Octubre 2026"');
    expect(csv).toContain('"Cobranza, sala"');
  });
});
