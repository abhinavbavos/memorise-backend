// models/Report.js
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

/**
 * Moderation-ready Report model
 * - Unified for user & post reports
 * - Open → Reviewed workflow
 * - Decision + Action captured for auditability
 * - Backward-compatible with older enums (hide/delete/warn/ban)
 */
const ReportSchema = new Schema(
  {
    // What is being reported
    type: {
      type: String,
      enum: ["post", "user"],
      required: true,
      index: true,
    },

    // Target document id (User._id or Post._id)
    targetId: {
      type: Types.ObjectId,
      required: true,
      index: true,
    },

    // Who reported
    reporterId: { type: Types.ObjectId, ref: "User", default: null },
    reporterIP: { type: String, default: "" },

    // Why it was reported
    reason: { type: String, default: "" },
    details: { type: String, default: "" },

    /**
     * Workflow status
     * - We use "open" and "reviewed" going forward.
     * - Kept older values for backward compatibility with existing data.
     */
    status: {
      type: String,
      enum: ["open", "reviewed", "reviewing", "resolved", "dismissed"],
      default: "open",
      index: true,
    },

    /**
     * Moderator decision (for reviewed items)
     * - accepted: report valid → action may be taken
     * - rejected: report not valid → no action
     */
    decision: {
      type: String,
      enum: ["accepted", "rejected", null],
      default: null,
      index: true,
    },

    /**
     * Action taken on target (if any)
     * - New canonical values:
     *   - ban_user      (for user targets)
     *   - hide_post     (for post targets)
     *   - remove_post   (for post targets; soft-delete recommended)
     * - Legacy values kept for compatibility:
     *   - hide, delete, warn, ban
     */
    actionTaken: {
      type: String,
      enum: [
        null,
        "ban_user",
        "hide_post",
        "remove_post",
        // legacy compatibility
        "hide",
        "delete",
        "warn",
        "ban",
      ],
      default: null,
      index: true,
    },

    // Which moderator reviewed it
    moderatorId: { type: Types.ObjectId, ref: "User", default: null },

    // Backward-compat alias (if older code uses adminId)
    adminId: { type: Types.ObjectId, ref: "User", default: null },

    // When it was reviewed
    reviewedAt: { type: Date, default: null },

    // Optional moderator note
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

/** Helpful indexes */
ReportSchema.index({ status: 1, type: 1, createdAt: -1 });
ReportSchema.index({ targetId: 1, type: 1 });

/**
 * Auto-set reviewedAt when moving to reviewed or when decision is set.
 */
ReportSchema.pre("save", function nextHook(next) {
  if (
    (this.isModified("status") && this.status === "reviewed") ||
    (this.isModified("decision") && this.decision != null)
  ) {
    this.reviewedAt = this.reviewedAt || new Date();
  }
  next();
});

/** Clean JSON */
ReportSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

export default mongoose.model("Report", ReportSchema);
