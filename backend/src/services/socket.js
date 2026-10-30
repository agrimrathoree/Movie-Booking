let activeIo;

export function setSocketServer(io) {
  activeIo = io;
}

export function publishSeatChanges(showId, seats) {
  if (!activeIo) return;
  activeIo.to("show:" + String(showId)).emit("seats:changed", {
    showId: String(showId),
    seats: seats.map((seat) => ({ seatId: seat.seatId, state: seat.state, expiresAt: seat.expiresAt || null })),
  });
}
