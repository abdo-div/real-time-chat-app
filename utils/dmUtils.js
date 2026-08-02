import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";

/**
 * Deterministic slug for a DM room between two users.
 * Both users always compute the SAME slug, so they converge on one room.
 */
export const dmSlugFor = (userA, userB) =>
  `dm-${[String(userA), String(userB)].sort().join("-")}`;

/**
 * Make sure a user is recorded as a member of a room.
 * Safe against concurrent calls (unique index + $setOnInsert).
 */
const ensureMembership = async (roomId, userId) => {
  try {
    await RoomMember.updateOne(
      { room: roomId, user: userId },
      { $setOnInsert: { room: roomId, user: userId, role: "member" } },
      { upsert: true },
    );
  } catch (err) {
    // Lost a concurrent upsert race - the membership already exists
    if (!err || err.code !== 11000) throw err;
  }
};

/**
 * Find an existing DM room between two users, or create one.
 *
 * Order of lookup:
 *  1. The deterministic room (slug = dm-<a>-<b>) if it already exists.
 *  2. Any existing DM room between the pair (legacy timestamp slugs).
 *  3. Otherwise create one with the deterministic slug.
 *
 * Creation is race-safe: if two requests create the same pair's room at the
 * same instant, the loser catches the duplicate-key error and reuses the
 * winner's room instead of crashing.
 */
export const findOrCreateDMRoom = async ({ userA, userB }) => {
  const a = userA.toString();
  const b = userB.toString();
  const slug = dmSlugFor(a, b);

  // 1. Prefer the deterministic room if it already exists
  let room = await Room.findOne({ slug });
  if (room) {
    await ensureMembership(room._id, a);
    await ensureMembership(room._id, b);
    return room;
  }

  // 2. Fall back to any existing DM room between the pair (legacy rooms).
  //    Pick the OLDEST so both users deterministically converge on the same room.
  const myDMs = await RoomMember.find({ user: a }).select("room");
  const myDMRoomIds = myDMs.map((m) => m.room);
  const legacy = await RoomMember.findOne({
    user: b,
    room: { $in: myDMRoomIds },
  })
    .sort({ createdAt: 1, _id: 1 })
    .populate({ path: "room", match: { type: "dm" } });
  if (legacy && legacy.room) return legacy.room;

  // 3. Create with the deterministic slug (race-safe)
  try {
    room = await Room.create({
      name: `dm-${a}-${b}`,
      slug,
      isPrivate: true,
      type: "dm",
      createdBy: a,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      room = await Room.findOne({ slug });
    } else {
      throw err;
    }
  }
  if (!room) throw new Error("Failed to create DM room");

  await ensureMembership(room._id, a);
  await ensureMembership(room._id, b);
  return room;
};
