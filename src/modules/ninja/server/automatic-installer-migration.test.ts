import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261023170000_automatic_connector_installer_pairing.sql",
  "utf8",
);

describe("identity automatic installer migration", () => {
  it("atomically validates the email token and creates an identity-scoped pairing", () => {
    expect(migration).toContain("consume_identity_connector_download_with_pairing");
    expect(migration).toContain("installations.download_token_hash = encode(extensions.digest(target_token");
    expect(migration).toContain("codes.identity_id = selected_identity.id");
    expect(migration).toContain("owner_user_id, identity_id, code_hash, expires_at");
    expect(migration).toContain("target_pairing_expires_at > now() + interval '10 minutes'");
  });
});
