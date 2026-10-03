import { describe, expect, it } from "vitest";
import { NETWORKS, approvedToken, normalizeAddress, parseTransfer, unitsToCents } from "./stablecoins";
import { movementMatches } from "./matching";

const address = `0x${"a".repeat(40)}`;
const other = `0x${"b".repeat(40)}`;
const row = { address: NETWORKS[0].tokens[0].address, from_address: other, to_address: address,
  token_decimals: "6", value: "1234567", transaction_hash: `0x${"c".repeat(64)}`, log_index: 2, block_timestamp: "2026-10-03T02:00:00Z" };
describe("stablecoin evidence", () => {
  it("normalizes separate accounts without trusting wallet brand", () => {
    expect(normalizeAddress(address.toUpperCase())).toBe(address);
    expect(() => normalizeAddress("seed phrase")).toThrow();
    expect(() => normalizeAddress(`0x${"0".repeat(40)}`)).toThrow();
  });
  it("accepts only vetted contracts on their networks", () => {
    expect(approvedToken("eth", NETWORKS[0].tokens[0].address)?.symbol).toBe("USDT");
    expect(approvedToken("base", NETWORKS[0].tokens[0].address)).toBeUndefined();
    expect(parseTransfer("eth", address, { ...row, address: other, token_symbol: "USDT" })).toBeNull();
  });
  it("uses exact units with rounding only at display boundary", () => {
    expect(unitsToCents("1234567")).toBe(123);
    expect(unitsToCents("1235000")).toBe(124);
    expect(() => unitsToCents("-1")).toThrow();
    expect(() => unitsToCents("999999999999999999999999999999999")).toThrow();
  });
  it("preserves transaction identity, self-transfers and raw amount", () => {
    expect(parseTransfer("eth", address, row)).toMatchObject({ direction: "in", raw_amount: "1234567", log_index: 2 });
    expect(parseTransfer("eth", address, { ...row, from_address: address })).toMatchObject({ direction: "self" });
    expect(() => parseTransfer("eth", address, { ...row, value: 1234567 })).toThrow();
  });
  it("matches both legs of a single transfer, not two new expenses", () => {
    const movement = { id: "m", wallet_id: "source", destination_wallet_id: "dest", kind: "wallet_to_wallet", amount_cents: 10000, fee_cents: 100, occurred_on: "2026-10-02" };
    expect(movementMatches({ wallet_id: "source", direction: "out", amount_cents: 10000, occurred_at: row.block_timestamp }, movement)).toBe(true);
    expect(movementMatches({ wallet_id: "dest", direction: "in", amount_cents: 9900, occurred_at: row.block_timestamp }, movement)).toBe(true);
    expect(movementMatches({ wallet_id: "other", direction: "in", amount_cents: 9900, occurred_at: row.block_timestamp }, movement)).toBe(false);
    expect(movementMatches({ wallet_id: "dest", direction: "in", amount_cents: 10000, occurred_at: row.block_timestamp }, movement)).toBe(false);
  });
});
