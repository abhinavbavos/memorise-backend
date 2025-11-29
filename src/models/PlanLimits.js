// models/PlanLimits.js
import mongoose from "mongoose";

const planLimitsSchema = new mongoose.Schema({
  plan: { type: String, enum: ["basic", "premium"], unique: true },
  maxPosts: Number,
  maxFileSizeMB: Number,
  allowedMime: {
    type: [String],
    default: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
  },
  canChangeCover: { type: Boolean, default: false },
});

// Safe defaults
const DEFAULTS = {
  basic: {
    plan: "basic",
    maxPosts: 10,
    maxFileSizeMB: 10,
    allowedMime: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    canChangeCover: false,
  },
  premium: {
    plan: "premium",
    maxPosts: 1000,
    maxFileSizeMB: 100,
    allowedMime: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
    canChangeCover: true,
  },
};

planLimitsSchema.statics.getLimits = async function (plan) {
  const key = plan === "premium" ? "premium" : "basic";
  const base = DEFAULTS[key];
  const doc = await this.findOne({ plan: key }).lean();
  // IMPORTANT: merge DB over defaults; missing fields fall back to defaults
  return { ...base, ...(doc || {}) };
};

export default mongoose.model("PlanLimits", planLimitsSchema);
