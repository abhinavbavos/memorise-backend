// src/controllers/adminController.js
import mongoose from "mongoose";
import Joi from "joi";

import User from "../models/User.js";
import Post from "../models/Post.js";
import Report from "../models/Report.js";
import Payment from "../models/Payment.js";
import Setting from "../models/Setting.js";
import AuditLog from "../models/AuditLog.js";
import { getPresignedGetURL } from "../config/s3.js";

/* =========================================================
 * DASHBOARD
 * =======================================================*/
export async function dashboard(req, res) {
  try {
    const [users, posts, openReports, reviewedReports] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments({ status: { $in: ["active", "hidden"] } }),
      Report.countDocuments({ status: "open" }),
      Report.countDocuments({ status: "reviewed" }),
    ]);

    res.json({ users, posts, openReports, reviewedReports });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
}

/* =========================================================
 * POST MODERATION (direct actions; also used by report resolution)
 * =======================================================*/
export async function hidePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const before = { status: post.status };
    post.status = "hidden";
    await post.save();

    await AuditLog.log({
      actor: {
        type: "admin",
        id: req.user.id,
        ip: req.ip,
        ua: req.headers["user-agent"],
      },
      action: "POST_HIDDEN",
      target: { type: "post", id: post._id },
      reason: "Manual moderation",
      meta: { fromStatus: before.status, toStatus: "hidden" },
      before,
      after: { status: post.status },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to hide post" });
  }
}

export async function removePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    const before = { status: post.status, removedAt: post.removedAt || null };
    post.status = "removed";
    post.removedAt = new Date();
    post.removedBy = req.user.id;
    await post.save();

    await AuditLog.log({
      actor: {
        type: "admin",
        id: req.user.id,
        ip: req.ip,
        ua: req.headers["user-agent"],
      },
      action: "POST_REMOVED",
      target: { type: "post", id: post._id },
      reason: "Manual moderation",
      meta: { fromStatus: before.status, toStatus: "removed" },
      before,
      after: {
        status: post.status,
        removedAt: post.removedAt,
        removedBy: post.removedBy,
      },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to remove post" });
  }
}

/* =========================================================
 * USER MODERATION
 * =======================================================*/
export async function setUserStatus(req, res) {
  const schema = Joi.object({
    status: Joi.string().valid("active", "suspended", "banned").required(),
    reason: Joi.string().allow("").default("Manual status change"),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const before = { status: user.status };
    user.status = value.status;
    await user.save();

    await AuditLog.log({
      actor: {
        type: "admin",
        id: req.user.id,
        ip: req.ip,
        ua: req.headers["user-agent"],
      },
      action: "USER_STATUS_CHANGED",
      target: { type: "user", id: user._id },
      reason: value.reason,
      meta: { fromStatus: before.status, toStatus: user.status },
      before,
      after: { status: user.status },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update user status" });
  }
}

/* =========================================================
 * USER LIST & DETAIL
 * =======================================================*/
export async function listUsers(req, res) {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().allow("").default(""),
    sort: Joi.string()
      .pattern(/^(-)?(createdAt|name|email)$/)
      .default("-createdAt"),
  });

  const { error, value } = schema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const { page, limit, search, sort } = value;

    const query = search
      ? {
          $or: [
            { name: new RegExp(search, "i") },
            { email: new RegExp(search, "i") },
          ],
        }
      : {};

    const sortSpec = sort.startsWith("-")
      ? { [sort.slice(1)]: -1 }
      : { [sort]: 1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Attach short-lived avatarUrl if the record has avatarKey
    const usersWithAvatars = await Promise.all(
      users.map(async (u) => ({
        ...u,
        avatarUrl:
          u.avatarUrl ||
          (u.avatarKey
            ? await getPresignedGetURL({ key: u.avatarKey, expires: 300 })
            : null),
      }))
    );

    res.json({
      users: usersWithAvatars,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load users" });
  }
}

export async function getUserDetail(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .select("-passwordHash -__v")
      .lean();
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load user" });
  }
}

export async function updateUser(req, res) {
  const schema = Joi.object({
    name: Joi.string().min(2),
    email: Joi.string().email(),
    role: Joi.string().valid("user", "admin"),
    plan: Joi.string().valid("free", "basic", "premium"),
    city: Joi.string().allow(""),
    country: Joi.string().allow(""),
    status: Joi.string().valid("active", "suspended", "banned"),
    planValidUntil: Joi.date().optional(),
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const prev = await User.findById(req.params.id).lean();
    if (!prev) return res.status(404).json({ error: "Not found" });

    const user = await User.findByIdAndUpdate(req.params.id, value, {
      new: true,
      select: "-passwordHash -__v",
    });

    // Log significant changes
    const diffs = {};
    [
      "role",
      "plan",
      "status",
      "name",
      "email",
      "city",
      "country",
      "planValidUntil",
    ].forEach((k) => {
      if (value[k] !== undefined && prev[k] !== value[k]) {
        diffs[k] = { from: prev[k] ?? null, to: value[k] };
      }
    });

    if (Object.keys(diffs).length) {
      await AuditLog.log({
        actor: {
          type: "admin",
          id: req.user.id,
          ip: req.ip,
          ua: req.headers["user-agent"],
        },
        action: "USER_UPDATED",
        target: { type: "user", id: user._id },
        meta: { diffs },
        before: prev,
        after: user.toObject(),
      });
    }

    res.json(user);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update user" });
  }
}

export async function deleteUser(req, res) {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) {
      await AuditLog.log({
        actor: {
          type: "admin",
          id: req.user.id,
          ip: req.ip,
          ua: req.headers["user-agent"],
        },
        action: "USER_DELETED",
        target: { type: "user", id: user._id },
        before: user.toObject(),
        after: null,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete user" });
  }
}

/* =========================================================
 * PAYMENTS
 * =======================================================*/
export async function listPayments(req, res) {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string()
      .valid("completed", "pending", "failed", "succeeded")
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    search: Joi.string().allow("").default(""),
  });

  const { error, value } = schema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const { page, limit, status, startDate, endDate, search } = value;

    const q = {};
    if (status) q.status = status === "succeeded" ? "completed" : status;
    if (startDate || endDate)
      q.createdAt = {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: new Date(endDate) } : {}),
      };
    if (search) q.$or = [{ description: new RegExp(search, "i") }];

    const [items, total] = await Promise.all([
      Payment.find(q)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Payment.countDocuments(q),
    ]);

    res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load payments" });
  }
}

export async function getPaymentDetail(req, res) {
  try {
    const payment = await Payment.findById(req.params.id).lean();
    if (!payment) return res.status(404).json({ error: "Not found" });
    res.json(payment);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load payment" });
  }
}

export async function addManualPayment(req, res) {
  const schema = Joi.object({
    userId: Joi.string().required(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().required(),
    description: Joi.string().allow(""),
    status: Joi.string().valid("pending", "completed", "failed").required(),
    planAtPurchase: Joi.string().valid("premium", "basic", "free").optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const payment = new Payment(value);
    await payment.save();

    await AuditLog.log({
      actor: {
        type: "admin",
        id: req.user.id,
        ip: req.ip,
        ua: req.headers["user-agent"],
      },
      action: "PAYMENT_MANUAL_ADDED",
      target: { type: "payment", id: payment._id },
      meta: { ...value },
      after: payment.toObject(),
    });

    res.status(201).json(payment);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to add payment" });
  }
}

/* =========================================================
 * SETTINGS
 * =======================================================*/
export async function getSettings(req, res) {
  try {
    const settings = await Setting.findOne().lean();
    res.json(settings || {});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load settings" });
  }
}

export async function updateSettings(req, res) {
  const schema = Joi.object({
    siteName: Joi.string(),
    maintenanceMode: Joi.boolean(),
    supportEmail: Joi.string().email(),
    premiumPrice: Joi.number(),
    premiumCurrency: Joi.string(),
    premiumPeriodMonths: Joi.number().integer().min(1),
    reportAutoFlagThreshold: Joi.number().integer().min(1),
  }).min(1);

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  try {
    let settings = await Setting.findOne();
    const before = settings ? settings.toObject() : null;

    if (!settings) settings = new Setting();
    Object.assign(settings, value);
    await settings.save();

    await AuditLog.log({
      actor: {
        type: "admin",
        id: req.user.id,
        ip: req.ip,
        ua: req.headers["user-agent"],
      },
      action: "SETTINGS_UPDATED",
      target: { type: "setting", id: settings._id },
      meta: { keys: Object.keys(value) },
      before,
      after: settings.toObject(),
    });

    res.json(settings);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update settings" });
  }
}

/* =========================================================
 * RECENTS (Dashboard side widgets)
 * =======================================================*/
export async function getRecentUsers(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("name email createdAt avatarKey plan")
      .lean();

    const withAvatars = await Promise.all(
      users.map(async (u) => ({
        ...u,
        avatarUrl: u.avatarKey
          ? await getPresignedGetURL({ key: u.avatarKey, expires: 300 })
          : null,
      }))
    );

    res.json(withAvatars);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load recent users" });
  }
}

export async function getRecentSubscriptions(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const subs = await Payment.find({
      status: "completed",
      planAtPurchase: "premium",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "name email")
      .lean();

    res.json(subs);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load recent subscriptions" });
  }
}

/* =========================================================
 * REPORTS (Moderation queue)
 * =======================================================*/
export async function listReports(req, res) {
  const schema = Joi.object({
    status: Joi.string().valid("open", "reviewed", "all").default("open"),
    type: Joi.string().valid("post", "user", "all").default("all"),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(200).default(50),
  });

  const { error, value } = schema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });

  try {
    const { status, type, page, pageSize } = value;
    const q = {};
    if (status !== "all") q.status = status;
    if (type !== "all") q.type = type;

    const skip = (page - 1) * pageSize;
    const projection =
      "type status decision actionTaken reason details note createdAt reporter reporterEmail reporterName targetId moderatorId reviewedAt";

    const [items, total, openCount, reviewedCount] = await Promise.all([
      Report.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select(projection)
        .lean(),
      Report.countDocuments(q),
      Report.countDocuments({ status: "open" }),
      Report.countDocuments({ status: "reviewed" }),
    ]);

    // Normalize a safe target node
    const normalized = items.map((r) => ({
      ...r,
      target: { type: r.type, id: r.targetId ?? null },
    }));

    res.json({
      items: normalized,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: { open: openCount, reviewed: reviewedCount },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load reports" });
  }
}

/**
 * Resolve a report.
 * - For user reports:
 *   - decision=accept -> ban user
 *   - decision=reject -> nothing
 * - For post reports:
 *   - decision=accept -> hide post
 *   - action=remove (optional) -> remove (soft-delete) post
 */
export async function resolveReport(req, res) {
  const schema = Joi.object({
    decision: Joi.string().valid("accept", "reject").required(),
    action: Joi.string().valid("remove").optional(), // only for posts
    note: Joi.string().allow("").optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { id } = req.params;
  const { decision, action, note } = value;

  const session = await mongoose.startSession();
  try {
    let finalReport;
    await session.withTransaction(async () => {
      const report = await Report.findById(id).session(session);
      if (!report) throw new Error("Report not found");

      // If already reviewed, just return it
      if (report.status === "reviewed") {
        finalReport = report;
        return;
      }

      let actionTaken = null;
      const correlationId = `report:${report._id.toString()}`;

      if (report.type === "user") {
        if (decision === "accept") {
          const user = await User.findById(report.targetId).session(session);
          if (!user) throw new Error("User not found");

          const before = { status: user.status };
          user.status = "banned";
          await user.save({ session });

          actionTaken = "ban_user";
          await AuditLog.log({
            actor: {
              type: "admin",
              id: req.user.id,
              ip: req.ip,
              ua: req.headers["user-agent"],
            },
            action: "USER_BANNED",
            target: { type: "user", id: user._id },
            reason: note || "Report accepted",
            meta: {
              fromStatus: before.status,
              toStatus: "banned",
              reportId: report._id,
            },
            before,
            after: { status: user.status },
            correlationId,
          });
        }
        // reject => no target-side change
      }

      if (report.type === "post") {
        const post = await Post.findById(report.targetId).session(session);
        if (!post) throw new Error("Post not found");

        const before = {
          status: post.status,
          removedAt: post.removedAt || null,
        };

        if (decision === "accept") {
          // Accept => hide the post
          post.status = "hidden";
          await post.save({ session });

          actionTaken = "hide_post";
          await AuditLog.log({
            actor: {
              type: "admin",
              id: req.user.id,
              ip: req.ip,
              ua: req.headers["user-agent"],
            },
            action: "POST_HIDDEN",
            target: { type: "post", id: post._id },
            reason: note || "Report accepted",
            meta: {
              fromStatus: before.status,
              toStatus: "hidden",
              reportId: report._id,
            },
            before,
            after: { status: post.status },
            correlationId,
          });
        }

        if (action === "remove") {
          // Soft-delete (removable but auditable)
          post.status = "removed";
          post.removedAt = new Date();
          post.removedBy = req.user.id;
          await post.save({ session });

          actionTaken = "remove_post";
          await AuditLog.log({
            actor: {
              type: "admin",
              id: req.user.id,
              ip: req.ip,
              ua: req.headers["user-agent"],
            },
            action: "POST_REMOVED",
            target: { type: "post", id: post._id },
            reason:
              note ||
              (decision === "accept" ? "Report accepted & removed" : "Removed"),
            meta: {
              fromStatus: before.status,
              toStatus: "removed",
              reportId: report._id,
            },
            before,
            after: {
              status: post.status,
              removedAt: post.removedAt,
              removedBy: post.removedBy,
            },
            correlationId,
          });
        }
      }

      // finalize report
      report.status = "reviewed";
      report.decision = decision === "accept" ? "accepted" : "rejected";
      report.actionTaken = actionTaken;
      report.moderatorId = req.user.id;
      report.reviewedAt = new Date();
      if (note) report.note = note;
      await report.save({ session });

      await AuditLog.log({
        actor: {
          type: "admin",
          id: req.user.id,
          ip: req.ip,
          ua: req.headers["user-agent"],
        },
        action: "REPORT_RESOLVED",
        target: { type: "report", id: report._id },
        meta: { decision: report.decision, actionTaken },
        correlationId,
      });

      finalReport = report;
    });

    res.json({ ok: true, report: finalReport });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to resolve report" });
  } finally {
    session.endSession();
  }
}

/* Optional: Bulk resolve */
export async function bulkResolveReports(req, res) {
  const schema = Joi.object({
    ids: Joi.array().items(Joi.string()).min(1).required(),
    decision: Joi.string().valid("accept", "reject").required(),
    action: Joi.string().valid("remove").optional(),
    note: Joi.string().allow("").optional(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const { ids, decision, action, note } = value;
  const results = [];

  for (const id of ids) {
    try {
      // Call resolveReport logic per id
      const fakeReq = {
        params: { id },
        body: { decision, action, note },
        user: req.user,
        ip: req.ip,
        headers: req.headers,
      };
      const fakeRes = {
        _payload: null,
        json(x) {
          this._payload = x;
        },
        status() {
          return this;
        },
      };
      await resolveReport(fakeReq, fakeRes);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }

  res.json({ results });
}

/* =========================================================
 * REVERT MODERATION ACTION (via AuditLog)
 * =======================================================*/
export async function revertAction(req, res) {
  const { auditId } = req.params;

  const session = await mongoose.startSession();
  try {
    let revertLog;
    await session.withTransaction(async () => {
      const log = await AuditLog.findById(auditId).session(session);
      if (!log) throw new Error("Audit log not found");

      const { targetType, targetId, meta } = log;
      const fromStatus = meta?.fromStatus;
      const toStatus = meta?.toStatus;

      if (!fromStatus) throw new Error("Missing fromStatus in audit meta");
      if (!targetType || !targetId)
        throw new Error("Invalid target in audit log");

      if (targetType === "user") {
        const user = await User.findById(targetId).session(session);
        if (!user) throw new Error("User not found");

        const before = { status: user.status };
        user.status = fromStatus;
        await user.save({ session });

        revertLog = await AuditLog.log({
          actor: {
            type: "admin",
            id: req.user.id,
            ip: req.ip,
            ua: req.headers["user-agent"],
          },
          action: "ACTION_REVERTED",
          target: { type: "user", id: targetId },
          meta: {
            revertedAction: log.action,
            fromStatus: toStatus,
            toStatus: fromStatus,
            originalAuditId: log._id,
          },
          before,
          after: { status: user.status },
          undoOf: log._id,
        });
      } else if (targetType === "post") {
        const post = await Post.findById(targetId).session(session);
        if (!post) throw new Error("Post not found");

        const before = {
          status: post.status,
          removedAt: post.removedAt || null,
          removedBy: post.removedBy || null,
        };
        // restore original
        post.status = fromStatus;
        if (fromStatus !== "removed") {
          post.removedAt = null;
          post.removedBy = null;
        }
        await post.save({ session });

        revertLog = await AuditLog.log({
          actor: {
            type: "admin",
            id: req.user.id,
            ip: req.ip,
            ua: req.headers["user-agent"],
          },
          action: "ACTION_REVERTED",
          target: { type: "post", id: targetId },
          meta: {
            revertedAction: log.action,
            fromStatus: toStatus,
            toStatus: fromStatus,
            originalAuditId: log._id,
          },
          before,
          after: {
            status: post.status,
            removedAt: post.removedAt,
            removedBy: post.removedBy,
          },
          undoOf: log._id,
        });
      } else {
        throw new Error(`Revert not supported for targetType=${targetType}`);
      }
    });

    res.json({ ok: true, audit: revertLog });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to revert action" });
  } finally {
    session.endSession();
  }
}
