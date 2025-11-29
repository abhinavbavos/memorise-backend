import "dotenv/config";
import mongoose from "mongoose";
import sharp from "sharp";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import Post from "../models/Post.js";

// ---------- Config ----------
const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION;
const REQUIRE_SSE = String(process.env.REQUIRE_SSE).toLowerCase() === "true";
const BATCH = Number(process.env.THUMB_BATCH || 10);
const DELAY_MS = Number(process.env.THUMB_DELAY_MS || 3000);
const MAX_ATTEMPTS = Number(process.env.THUMB_MAX_ATTEMPTS || 5);
const MAX_EDGE = Number(process.env.THUMB_MAX_EDGE || 640);

if (!BUCKET || !REGION) {
  console.error("[thumbWorker] Missing S3_BUCKET / S3_REGION env vars");
  process.exit(1);
}

// ---------- AWS S3 ----------
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

// ---------- Helpers ----------
function deriveThumbKey(fileKey) {
  // user-uploads/<userId>/posts/<uuid>.<ext> -> user-uploads/<userId>/posts/<uuid>_thumb.jpg
  return fileKey.replace(/\.[^.]+$/, "_thumb.jpg");
}

async function s3ObjectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadBuffer(key) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await obj.Body.transformToByteArray();
  return Buffer.from(bytes);
}

async function uploadJpeg(key, buffer) {
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg",
    ...(REQUIRE_SSE ? { ServerSideEncryption: "AES256" } : {}),
  };
  await s3.send(new PutObjectCommand(params));
}

// ---------- Core ----------
async function processOne(p) {
  const { _id, fileKey, fileMime } = p;
  const thumbKey = deriveThumbKey(fileKey);

  // Idempotence: if thumb already in S3, just mark done
  if (await s3ObjectExists(thumbKey)) {
    await Post.updateOne(
      { _id },
      { thumbKey, thumbPending: false, thumbError: "" }
    );
    return { id: _id, status: "skipped-exists" };
  }

  // Only make thumbs for images
  if (!/^image\//.test(fileMime)) {
    await Post.updateOne({ _id }, { thumbPending: false, thumbError: "" });
    return { id: _id, status: "skipped-nonimage" };
  }

  try {
    const input = await downloadBuffer(fileKey);
    const out = await sharp(input)
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    await uploadJpeg(thumbKey, out);
    await Post.updateOne(
      { _id },
      { thumbKey, thumbPending: false, thumbError: "", thumbAttempts: 0 }
    );
    return { id: _id, status: "ok" };
  } catch (err) {
    const attempts = (p.thumbAttempts || 0) + 1;
    const patch = {
      thumbAttempts: attempts,
      thumbError: err.message || "thumb error",
    };
    if (attempts >= MAX_ATTEMPTS) patch.thumbPending = false; // stop retrying
    await Post.updateOne({ _id }, patch);
    return { id: _id, status: "error", error: err.message };
  }
}

async function loopOnce() {
  const q = {
    thumbPending: true,
    status: { $ne: "removed" },
    thumbAttempts: { $lt: MAX_ATTEMPTS },
  };
  const items = await Post.find(q).sort({ createdAt: 1 }).limit(BATCH).lean();
  if (!items.length) return { processed: 0 };
  const results = [];
  for (const p of items) results.push(await processOne(p));
  return { processed: items.length, results };
}

// ---------- Bootstrap ----------
let shuttingDown = false;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing");
  await mongoose.connect(uri);
  console.log("[thumbWorker] Mongo connected");

  while (!shuttingDown) {
    const res = await loopOnce();
    if (res.processed) console.log("[thumbWorker]", res);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

process.on("SIGINT", async () => {
  console.log("[thumbWorker] SIGINT received, shutting down…");
  shuttingDown = true;
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("[thumbWorker] SIGTERM received, shutting down…");
  shuttingDown = true;
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
});

main().catch((e) => {
  console.error("[thumbWorker] fatal", e);
  process.exit(1);
});
