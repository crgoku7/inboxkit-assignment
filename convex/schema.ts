import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  blocks: defineTable({
    key: v.string(),
    row: v.number(),
    col: v.number(),
    ownerId: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    ownerAvatar: v.optional(v.string()),
  }).index("by_key", ["key"]),
});
