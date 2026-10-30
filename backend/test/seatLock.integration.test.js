import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import SeatLock from "../src/models/SeatLock.js";

test("MongoDB unique seat index prevents two users from holding the same seat", {
  skip: !process.env.MONGO_TEST_URI,
}, async () => {
  await mongoose.connect(process.env.MONGO_TEST_URI);
  try {
    await SeatLock.createIndexes();
    const showId = new mongoose.Types.ObjectId();
    const owners = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const results = await Promise.allSettled(owners.map((ownerId, index) => SeatLock.create({
      showId,
      seatId: "A1",
      ownerId,
      holdId: "integration-test-" + index + "-" + showId,
      expiresAt: new Date(Date.now() + 60000),
    })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await SeatLock.countDocuments({ showId, seatId: "A1" }), 1);
    await SeatLock.deleteMany({ showId });
  } finally {
    await mongoose.disconnect();
  }
});
