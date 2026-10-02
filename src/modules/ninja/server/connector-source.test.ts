import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const connectorSource = readFileSync(
  join(process.cwd(), "integrations", "ninjatrader", "NodalNinjaConnector.cs"),
  "utf8",
);

describe("Ninja connector source", () => {
  it("publica la revisión de compatibilidad 0.8", () => {
    expect(connectorSource).toContain('ConnectorVersion = "0.8"');
  });

  it("evita la colisión entre el estado de cuenta y el enum de NinjaTrader", () => {
    expect(connectorSource).toContain(
      "item.Status == NinjaTrader.Cbi.ConnectionStatus.Connected",
    );
    expect(connectorSource).toContain("AccountConnectionStatus(account)");
    expect(connectorSource).not.toContain(
      "private static string ConnectionStatus(Account account)",
    );
  });
});
