import { expect, it } from "vitest";
import { createAccountingDatabase } from "./accounting-database";
it("loads the accounting schema and real procedures without historical customer data", async () => {
  const { db, applied } = await createAccountingDatabase();
  try {
    expect(applied.length).toBeGreaterThan(100);
    expect((await db.query("select * from public.nodal_users")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 120000);
