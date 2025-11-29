// models/AuditLog.js
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

/**
 * AuditLog
 * - Tracks every admin/user/system action for moderation & compliance
 * - Adds correlation & undo support so actions can be reverted later
 * - Stores optional before/after snapshots or diffs
 */
const AuditLogSchema = new Schema(
  {
    /** Who performed the action */
    actorType: {
      type: String,
      enum: ["user", "admin", "system", "service"],
      required: true,
      default: "system",
      index: true,
    },
    actorId: {
      type: Types.ObjectId, // ref: "User" (for admin/user); null for system/service
      default: null,
      index: true,
    },

    /** What happened */
    action: {
      type: String,
      required: true,
      index: true,
      // Examples you might use:
      // REPORT_ACCEPTED, REPORT_REJECTED, REPORT_REVIEWED,
      // USER_STATUS_CHANGED, USER_BANNED, USER_UNBANNED,
      // POST_HIDDEN, POST_UNHIDDEN, POST_REMOVED, POST_RESTORED,
      // SETTINGS_UPDATED, PAYMENT_MARKED_COMPLETED, etc.
    },

    /** What entity was affected */
    targetType: {
      type: String,
      enum: ["user", "post", "report", "payment", "setting", "trophy", "other"],
      required: true,
      index: true,
    },
    targetId: {
      type: Types.ObjectId, // aligns with your User/Post/Report ids
      default: null,
      index: true,
    },

    /** Optional high-level reason/comment for the action */
    reason: { type: String, default: "" },

    /**
     * Extra data (safe to store for debugging/traceability)
     * e.g. { from:"active", to:"suspended" } or external response ids
     */
    meta: { type: Schema.Types.Mixed, default: {} },

    /**
     * Snapshots (optional): store before/after state or minimal diffs
     * Use sparingly (PII/size). Great for reversible actions.
     */
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },

    /** Request context (optional but useful) */
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    /**
     * Correlate multiple logs for a single moderation flow
     * e.g. the report review + the action taken + notifications sent
     */
    correlationId: { type: String, default: null, index: true },

    /**
     * If this log is an explicit revert/undo of a previous log,
     * store that relationship here to enable quick tracebacks.
     */
    undoOf: {
      type: Types.ObjectId,
      ref: "AuditLog",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

/** Helpful compound indexes */
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

/** Clean JSON output */
AuditLogSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});

/**
 * Convenience helper to write an audit entry.
 * Example:
 *   await AuditLog.log({
 *     actor: { type: 'admin', id: req.user.id, ip: req.ip, ua: req.headers['user-agent'] },
 *     action: 'POST_HIDDEN',
 *     target: { type: 'post', id: postId },
 *     reason: 'Report accepted: hate speech',
 *     meta: { reportId },
 *     before: { status: prev.status },
 *     after: { status: 'hidden' },
 *     correlationId
 *   });
 */
AuditLogSchema.statics.log = function ({
  actor = {},
  action,
  target = {},
  reason = "",
  meta = {},
  before = null,
  after = null,
  correlationId = null,
  undoOf = null,
} = {}) {
  const doc = {
    actorType: actor.type || "system",
    actorId: actor.id || null,
    ip: actor.ip || null,
    userAgent: actor.ua || null,

    action,

    targetType: target.type || "other",
    targetId: target.id || null,

    reason,
    meta,
    before,
    after,

    correlationId,
    undoOf,
  };
  return this.create(doc);
};

export default mongoose.model("AuditLog", AuditLogSchema);
