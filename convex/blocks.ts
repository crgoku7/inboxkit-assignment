import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { GRID_COLS, GRID_ROWS } from "./grid";

const keyFor = (row: number, col: number) => `${row}:${col}`;

export const getGrid = query(async (ctx) => {
  const blocks = await ctx.db.query("blocks").collect();
  return {
    rows: GRID_ROWS,
    cols: GRID_COLS,
    blocks,
  };
});

export const claimBlock = mutation({
  args: {
    row: v.number(),
    col: v.number(),
  },
  handler: async (ctx, { row, col }) => {
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new Error("Invalid coordinates");
    }

    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) {
      throw new Error("Out of bounds");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const key = keyFor(row, col);
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    const ownerId = identity.subject;
    const ownerName =
      identity.name ?? identity.nickname ?? identity.givenName ?? "Anonymous";
    const ownerAvatar = identity.picture ?? undefined;

    if (existing) {
      if (existing.ownerId) {
        return { ok: false, reason: "owned", ownerId: existing.ownerId };
      }

      await ctx.db.patch(existing._id, {
        ownerId,
        ownerName,
        ownerAvatar,
      });
      return { ok: true };
    }

    await ctx.db.insert("blocks", {
      key,
      row,
      col,
      ownerId,
      ownerName,
      ownerAvatar,
    });

    return { ok: true };
  },
});
