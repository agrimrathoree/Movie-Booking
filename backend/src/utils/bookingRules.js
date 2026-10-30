export function normalizeSeatIds(input) {
  if (!Array.isArray(input)) return [];
  const ids = input.map((seat) => String(seat || "").trim().toUpperCase()).filter(Boolean);
  return [...new Set(ids)];
}

export function getSeatType(seatId, layout = []) {
  const row = String(seatId).match(/^[A-Z]+/)?.[0];
  return layout.find((item) => item.row.toUpperCase() === row)?.type || null;
}

export function isSeatInLayout(seatId, layout = []) {
  const match = String(seatId).match(/^([A-Z]+)([0-9]+)$/);
  if (!match) return false;
  const row = layout.find((item) => item.row.toUpperCase() === match[1]);
  return Boolean(row && Number(match[2]) >= 1 && Number(match[2]) <= row.count);
}

export function priceSeats(seatIds, layout, seatPrices) {
  return seatIds.map((seatId) => {
    const type = getSeatType(seatId, layout);
    if (!type) throw new Error("Seat is not part of this show.");
    const price = Number(seatPrices[type]);
    if (!Number.isFinite(price) || price < 0) throw new Error("Seat price is not configured.");
    return { seatId, type, price };
  });
}

export function sumSeatPrices(seats) {
  return Number(seats.reduce((total, seat) => total + seat.price, 0).toFixed(2));
}
