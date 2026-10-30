import test from "node:test";
import assert from "node:assert/strict";
import { isSeatInLayout, normalizeSeatIds, priceSeats, sumSeatPrices } from "../src/utils/bookingRules.js";

const layout = [
  { row: "A", count: 8, type: "standard" },
  { row: "D", count: 6, type: "recliner" },
];

test("normalizes and deduplicates seat IDs", () => {
  assert.deepEqual(normalizeSeatIds([" a1 ", "A1", "d4"]), ["A1", "D4"]);
});

test("seat IDs must exist in the show layout", () => {
  assert.equal(isSeatInLayout("A8", layout), true);
  assert.equal(isSeatInLayout("A9", layout), false);
  assert.equal(isSeatInLayout("D0", layout), false);
  assert.equal(isSeatInLayout("A-1", layout), false);
});

test("seat totals use server-provided standard and recliner pricing", () => {
  const seats = priceSeats(["A1", "D2"], layout, { standard: 200, recliner: 350 });
  assert.deepEqual(seats, [
    { seatId: "A1", type: "standard", price: 200 },
    { seatId: "D2", type: "recliner", price: 350 },
  ]);
  assert.equal(sumSeatPrices(seats), 550);
  assert.throws(() => priceSeats(["Z1"], layout, { standard: 200, recliner: 350 }));
});
