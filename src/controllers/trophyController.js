// src/controllers/trophyController.js
import Joi from "joi";
import mongoose from "mongoose";
import Trophy from "../models/Trophy.js";
import Post from "../models/Post.js";
import { getPresignedGetURL } from "../config/s3.js";

// Keep categories aligned with your Post model
const CATEGORY_ENUM = [
  "Awards",
  "Certificates",
  "Academics",
  "Sports",
  "Internship",
  "Others",
];

const trophySchema = Joi.object({
  title: Joi.string().trim().required(),
  category: Joi.string()
    .valid(...CATEGORY_ENUM)
    .required(),
  year: Joi.string()
    .pattern(/^\d{4}$/)
    .allow("")
    .optional(),
  imageKey: Joi.string().allow("").optional(),
});

async function signKeyOrNull(key) {
  return key ? await getPresignedGetURL({ key, expires: 3600 }) : null;
}

/**
 * GET /api/trophies/user/:id
 * - Returns explicit trophies for the user (with imageUrl), OR
 * - If none exist, falls back to posts (as “trophies”), using thumbKey or original image key.
 */
export async function listByUser(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  const userId = new mongoose.Types.ObjectId(id);

  // 1) Prefer saved trophies
  const trophies = await Trophy.find({ userId }).sort({ createdAt: -1 }).lean();

  if (trophies.length > 0) {
    const items = await Promise.all(
      trophies.map(async (t) => ({
        ...t,
        id: t._id?.toString?.(),
        imageUrl: await signKeyOrNull(t.imageKey),
      }))
    );
    return res.json(items);
  }

  // 2) Fallback to posts as trophies
  const posts = await Post.find({ userId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();

  const items = await Promise.all(
    posts.map(async (p) => {
      let imageUrl = null;
      if (p.thumbKey) imageUrl = await signKeyOrNull(p.thumbKey);
      else if (p.fileMime && p.fileMime.startsWith("image/")) {
        imageUrl = await signKeyOrNull(p.fileKey);
      }
      const year =
        p.createdAt instanceof Date
          ? String(p.createdAt.getFullYear())
          : p.createdAt
          ? String(new Date(p.createdAt).getFullYear())
          : "";

      return {
        title: p.title,
        category: p.category,
        year,
        imageUrl,
        _postId: p._id,
        _source: "post",
      };
    })
  );

  res.json(items);
}

/**
 * GET /api/trophies/me
 * - Returns the current user's explicit trophies with signed image URLs.
 */
export async function listMine(req, res) {
  const items = await Trophy.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  const withUrls = await Promise.all(
    items.map(async (t) => ({
      ...t,
      id: t._id?.toString?.(),
      imageUrl: await signKeyOrNull(t.imageKey),
    }))
  );

  res.json(withUrls);
}

/**
 * POST /api/trophies
 * body: { title, category, year?, imageKey? }
 * - Creates an explicit trophy.
 */
export async function createTrophy(req, res) {
  const { error, value } = trophySchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const doc = await Trophy.create({ userId: req.user.id, ...value });
  const out = {
    ...doc.toObject(),
    id: doc._id?.toString?.(),
    imageUrl: await signKeyOrNull(doc.imageKey),
  };
  res.status(201).json(out);
}

/**
 * DELETE /api/trophies/:id
 * - Removes an explicit trophy owned by the current user.
 */
export async function removeTrophy(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid id" });
  }
  const t = await Trophy.findOneAndDelete({ _id: id, userId: req.user.id });
  if (!t) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
}
