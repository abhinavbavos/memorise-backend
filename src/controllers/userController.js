// src/controllers/userController.js
import User from "../models/User.js";
import { v4 as uuidv4 } from "uuid";
import Joi from "joi";
import mongoose from "mongoose";
import { getPresignedPutURL, getPresignedGetURL } from "../config/s3.js";

// ---------- helpers ----------
const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
];

function isOwnerOrAdmin(req, userId) {
  return req.user?.role === "admin" || String(req.user?.id) === String(userId);
}

async function ensurePublicId(u) {
  if (!u.publicId) {
    u.publicId = uuidv4();
    await u.save();
  }
  return u.publicId;
}

async function serializeUserForMe(u) {
  const avatarUrl = u.avatarKey
    ? await getPresignedGetURL({ key: u.avatarKey, expires: 3600 })
    : null;
  const coverUrl = u.coverKey
    ? await getPresignedGetURL({ key: u.coverKey, expires: 3600 })
    : null;
  return {
    id: u._id?.toString?.(),
    _id: u._id,
    publicId: u.publicId,
    name: u.name,
    email: u.email,
    plan: u.plan,
    about: u.about,
    age: u.age,
    city: u.city,
    country: u.country,
    skills: u.skills,
    languages: u.languages,
    avatarKey: u.avatarKey,
    coverKey: u.coverKey,
    avatarUrl,
    coverUrl,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// ---------- controllers ----------

/** GET /api/users/me */
export async function getMe(req, res) {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: "Not found" });
  await ensurePublicId(u);
  const out = await serializeUserForMe(u);
  res.json(out);
}

/** GET /api/users/:id (owner/admin only) */
export async function getUser(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id))
    return res.status(400).json({ error: "Invalid id" });
  if (!isOwnerOrAdmin(req, id))
    return res.status(403).json({ error: "Forbidden" });
  const u = await User.findById(id);
  if (!u) return res.status(404).json({ error: "Not found" });
  const out = await serializeUserForMe(u);
  res.json(out);
}

/** PATCH /api/users/me */
export async function updateMe(req, res) {
  const schema = Joi.object({
    name: Joi.string(),
    email: Joi.string().email(),
    about: Joi.string().allow(""),
    age: Joi.number().min(0).max(120),
    city: Joi.string().allow(""),
    country: Joi.string().allow(""),
    skills: Joi.array().items(Joi.string()),
    languages: Joi.array().items(Joi.string()),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  if (value.email) {
    const exists = await User.findOne({
      _id: { $ne: req.user.id },
      email: value.email,
    });
    if (exists) return res.status(409).json({ error: "Email already in use" });
  }

  const u = await User.findOneAndUpdate({ _id: req.user.id }, value, {
    new: true,
  });
  if (!u) return res.status(404).json({ error: "Not found" });
  const out = await serializeUserForMe(u);
  res.json(out);
}

/** GET /api/users/me/presign/avatar */
export async function presignAvatar(req, res) {
  const contentType = req.query.contentType || "image/jpeg";
  const size = Number(req.query.size || 0);
  if (!ALLOWED_IMAGE_MIME.includes(contentType))
    return res.status(400).json({ error: "Mime not allowed" });
  if (size > 5 * 1024 * 1024)
    return res.status(400).json({ error: "Avatar too large (max 5MB)" });

  const key = `user-uploads/${req.user.id}/avatar-${uuidv4()}`;
  const url = await getPresignedPutURL({ key, contentType, expires: 60 });
  res.json({
    key,
    url,
    requiredHeaders: { "x-amz-server-side-encryption": "AES256" },
  });
}

/** POST /api/users/me/avatar */
export async function setAvatar(req, res) {
  const schema = Joi.object({ fileKey: Joi.string().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const u = await User.findByIdAndUpdate(
    req.user.id,
    { avatarKey: value.fileKey },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: "Not found" });
  const out = await serializeUserForMe(u);
  res.json(out);
}

/** GET /api/users/me/presign/cover */
export async function presignCover(req, res) {
  const contentType = req.query.contentType || "image/jpeg";
  const size = Number(req.query.size || 0);
  if (!ALLOWED_IMAGE_MIME.includes(contentType))
    return res.status(400).json({ error: "Mime not allowed" });
  if (size > 8 * 1024 * 1024)
    return res.status(400).json({ error: "Cover too large (max 8MB)" });

  const key = `user-uploads/${req.user.id}/cover-${uuidv4()}`;
  const url = await getPresignedPutURL({ key, contentType, expires: 60 });
  res.json({
    key,
    url,
    requiredHeaders: { "x-amz-server-side-encryption": "AES256" },
  });
}

/** POST /api/users/me/cover */
export async function setCover(req, res) {
  const schema = Joi.object({ fileKey: Joi.string().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const u = await User.findByIdAndUpdate(
    req.user.id,
    { coverKey: value.fileKey },
    { new: true }
  );
  if (!u) return res.status(404).json({ error: "Not found" });
  const out = await serializeUserForMe(u);
  res.json(out);
}

/** GET /api/users/public/:publicId */
export async function getPublicProfile(req, res) {
  const u = await User.findOne({ publicId: req.params.publicId });
  if (!u) return res.status(404).json({ error: "Profile not found" });

  const avatarUrl = u.avatarKey
    ? await getPresignedGetURL({ key: u.avatarKey, expires: 3600 })
    : null;
  const coverUrl = u.coverKey
    ? await getPresignedGetURL({ key: u.coverKey, expires: 3600 })
    : null;

  res.json({
    _id: u._id,
    id: u._id?.toString?.(),
    publicId: u.publicId,
    name: u.name,
    email: u.email,
    about: u.about,
    city: u.city,
    country: u.country,
    createdAt: u.createdAt,
    avatarUrl,
    coverUrl,
  });
}

/** POST /api/users/me/public-link/rotate */
export async function rotatePublicLink(req, res) {
  const u = await User.findById(req.user.id);
  if (!u) return res.status(404).json({ error: "Not found" });
  u.publicId = uuidv4();
  await u.save();
  const url = `${process.env.PUBLIC_ORIGIN || ""}/profile/${u.publicId}`;
  res.json({ publicId: u.publicId, url });
}
