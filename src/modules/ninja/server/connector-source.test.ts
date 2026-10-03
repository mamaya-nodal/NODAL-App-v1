import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LATEST_NINJA_CONNECTOR_VERSION } from "../domain/connector-version";

const connectorSource = readFileSync(
  join(process.cwd(), "integrations", "ninjatrader", "NodalNinjaConnector.cs"),
  "utf8",
);
const connectorInstaller = readFileSync(
  join(
    process.cwd(),
    "integrations",
    "ninjatrader",
    "NODAL-Ninja-Connector-setup.ps1",
  ),
  "utf8",
);

describe("Ninja connector source", () => {
  it("publica la revisión vigente", () => {
    expect(connectorSource).toContain(
      `ConnectorVersion = "${LATEST_NINJA_CONNECTOR_VERSION}"`,
    );
  });

  it("registra la versión del código copiado para que el runtime pueda informarla", () => {
    expect(connectorInstaller).toContain(
      '"InstalledSourceVersion=$connectorSourceVersion"',
    );
    expect(connectorSource).toContain('installedSourceVersion');
  });

  it("un código adicional agotado no interrumpe la sesión existente", () => {
    expect(connectorInstaller).toContain("Clear-PendingPairingCode -ConfigPath $connectorConfigPath");
    expect(connectorInstaller).toContain(".before-update.bak");
    expect(connectorSource).toContain("response.StatusCode == HttpStatusCode.Conflict");
    expect(connectorSource).toContain("VINCULO_ADICIONAL_DESCARTADO");
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
