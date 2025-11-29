// controllers/postController.js
import Post from "../models/Post.js";
import { v4 as uuidv4 } from "uuid";
import { getPresignedPutURL, getPresignedGetURL } from "../config/s3.js";
import PlanLimits from "../models/PlanLimits.js";
import Joi from "joi";
import mongoose from "mongoose";

// --- helpers ---
async function decoratePosts(rows, { includeFileUrl = false } = {}) {
  // small batch signing; page sizes are small in UI
  const out = [];
  for (const p of rows) {
    const thumbUrl = p.thumbKey
      ? await getPresignedGetURL({ key: p.thumbKey, expires: 3600 })
      : null;

    const fileUrl =
      includeFileUrl && p.fileKey
        ? await getPresignedGetURL({ key: p.fileKey, expires: 3600 })
        : undefined;

    out.push({
      ...p,
      id: p._id?.toString?.() || p.id, // convenience
      thumbUrl,
      ...(includeFileUrl ? { fileUrl } : {}),
    });
  }
  return out;
}

// --- endpoints ---
export async function presignPostFile(req, res) {
  const limits = await PlanLimits.getLimits(req.user.plan);
  const { contentType, size } = req.query;

  if (!limits.allowedMime.includes(contentType)) {
    return res.status(400).json({ error: "Mime not allowed" });
  }
  if (size && Number(size) / (1024 * 1024) > limits.maxFileSizeMB) {
    return res.status(400).json({ error: "File too large" });
  }

  const key = `user-uploads/${req.user.id}/posts/${uuidv4()}`;
  const { url, requiredHeaders } = await getPresignedPutURL({
    key,
    contentType,
  });
  res.json({ key, url, requiredHeaders });
}

export async function createPost(req, res) {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().allow("").required(),
    category: Joi.string()
      .valid("Awards", "Certificates", "Academics", "Sports", "Internship")
      .required(),
    fileKey: Joi.string().required(),
    fileMime: Joi.string()
      .valid("image/jpeg", "image/jpg", "image/png", "application/pdf")
      .required(),
    fileSize: Joi.number().required(),
  });

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  // mark that a thumb is expected when it’s an image
  const isImage = value.fileMime.startsWith("image/");
  const doc = await Post.create({
    userId: req.user.id,
    ...value,
    ...(isImage ? { thumbPending: true } : {}),
  });

  res.status(201).json(doc);
}

export async function listMyPosts(req, res) {
  const rows = await Post.find({
    userId: req.user.id,
    status: { $ne: "removed" },
  })
    .sort({ createdAt: -1 })
    .lean();

  const items = await decoratePosts(rows, { includeFileUrl: true });
  res.json(items);
}

export async function listPostsByUser(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));

  const { id } = req.params;
  const userId = mongoose.isValidObjectId(id)
    ? new mongoose.Types.ObjectId(id)
    : id;

  const q = { userId, status: "active" };
  if (req.query.category) q.category = req.query.category;

  const [rows, total] = await Promise.all([
    Post.find(q)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Post.countDocuments(q),
  ]);

  // Attach thumbUrl for public consumption
  const items = await Promise.all(
    rows.map(async (p) => {
      let thumbUrl = null;

      if (p.thumbKey) {
        thumbUrl = await getPresignedGetURL({ key: p.thumbKey, expires: 3600 });
      } else if (p.fileMime && p.fileMime.startsWith("image/")) {
        // no thumb yet? fall back to the original image
        thumbUrl = await getPresignedGetURL({ key: p.fileKey, expires: 3600 });
      }

      return {
        ...p,
        id: p._id?.toString?.(),
        thumbUrl,
      };
    })
  );

  res.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function removePost(req, res) {
  // owners can remove their own; admins handled elsewhere
  await Post.updateOne(
    { _id: req.params.id, userId: req.user.id },
    { status: "removed" }
  );
  res.json({ ok: true });
}

export async function categoryCountsByUser(req, res) {
  const rows = await Post.aggregate([
    {
      $match: {
        userId: new (
          await import("mongoose")
        ).default.Types.ObjectId(req.params.id),
        status: "active",
      },
    },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $project: { _id: 0, category: "$_id", count: 1 } },
  ]);
  res.json(rows);
}
