import Report from "../models/Report.js";
import User from "../models/User.js";
import Post from "../models/Post.js";
import AuditLog from "../models/AuditLog.js";
import Setting from "../models/Setting.js";
import mongoose from "mongoose";
import Joi from "joi";

export async function createReport(req, res) {
  const schema = Joi.object({
    type: Joi.string().valid("post", "user").required(),
    targetId: Joi.string().required(),
    reason: Joi.string().required(),
    details: Joi.string().allow(""),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  // deduplicate same reporter on same target within last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dedupQuery = {
    type: value.type,
    targetId: value.targetId,
    createdAt: { $gte: since },
  };
  if (req.user?.id) dedupQuery.reporterId = String(req.user.id);
  else dedupQuery.reporterIP = req.ip;
  const existing = await Report.findOne(dedupQuery).lean();
  if (existing) return res.status(202).json({ ok: true, deduped: true });

  const doc = await Report.create({
    ...value,
    reporterId: req.user?.id || null,
    reporterIP: req.ip,
  }); // naive auto-flag if many reports
  const settings = await Setting.findOne({}).lean();
  const threshold = Number(settings?.reportAutoFlagThreshold || 3);
  const reportsCount = await Report.countDocuments({
    type: value.type,
    targetId: value.targetId,
    status: "open",
  });
  if (reportsCount >= threshold && value.type === "post") {
    await Post.updateOne({ _id: value.targetId }, { status: "flagged" });
    await AuditLog.create({
      actorType: "system",
      actorId: null,
      action: "POST_FLAGGED",
      targetType: "post",
      targetId: value.targetId,
      meta: { reportsCount, threshold },
    });
  }
  res.status(201).json({ ok: true });
}

export async function listReports(req, res) {
  const schema = Joi.object({
    status: Joi.string()
      .valid("open", "reviewing", "resolved", "dismissed")
      .default("open"),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    type: Joi.string().valid("post", "user"),
  });
  const { error, value } = schema.validate(req.query);
  if (error) return res.status(400).json({ error: error.message });
  const { status, page, pageSize, type } = value;
  const q = { status };
  if (type) q.type = type;
  const [items, total] = await Promise.all([
    Report.find(q)
      .sort({ createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Report.countDocuments(q),
  ]);
  res.json({ items, total, page, totalPages: Math.ceil(total / pageSize) });
}

export async function resolveReport(req, res) {
  const schema = Joi.object({
    status: Joi.string().valid("reviewing", "resolved", "dismissed").required(),
    actionTaken: Joi.string()
      .valid("hide", "delete", "warn", "ban")
      .allow(null),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ error: "Not found" });

  // Cascade moderation action
  if (value.actionTaken && report.status !== "resolved") {
    if (report.type === "post") {
      if (!mongoose.isValidObjectId(report.targetId))
        return res.status(400).json({ error: "Invalid post id" });
      if (value.actionTaken === "hide")
        await Post.updateOne({ _id: report.targetId }, { status: "hidden" });
      if (value.actionTaken === "delete")
        await Post.updateOne({ _id: report.targetId }, { status: "removed" });
      await AuditLog.create({
        actorType: "admin",
        actorId: req.user.id,
        action: value.actionTaken === "delete" ? "POST_REMOVED" : "POST_HIDDEN",
        targetType: "post",
        targetId: report.targetId,
        meta: { reportId: report._id },
      });
    }
    if (report.type === "user") {
      if (!mongoose.isValidObjectId(report.targetId))
        return res.status(400).json({ error: "Invalid user id" });
      if (value.actionTaken === "warn") {
        // you might send email here (queue), we just log it
        await AuditLog.create({
          actorType: "admin",
          actorId: req.user.id,
          action: "USER_WARNED",
          targetType: "user",
          targetId: report.targetId,
          meta: { reportId: report._id },
        });
      }
      if (value.actionTaken === "ban") {
        await User.updateOne({ _id: report.targetId }, { status: "banned" });
        await AuditLog.create({
          actorType: "admin",
          actorId: req.user.id,
          action: "USER_BANNED",
          targetType: "user",
          targetId: report.targetId,
          meta: { reportId: report._id },
        });
      }
    }
  }

  report.status = value.status;
  report.actionTaken = value.actionTaken ?? report.actionTaken ?? null;
  report.adminId = req.user.id;
  await report.save();
  res.json(report);
}
