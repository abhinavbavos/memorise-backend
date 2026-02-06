import "dotenv/config";
import mongoose from "mongoose";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import Post from "../models/Post.js";

// ---------- Config ----------
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const BATCH = Number(process.env.THUMB_BATCH || 10);
const DELAY_MS = Number(process.env.THUMB_DELAY_MS || 3000);
const MAX_ATTEMPTS = Number(process.env.THUMB_MAX_ATTEMPTS || 5);
const MAX_EDGE = Number(process.env.THUMB_MAX_EDGE || 640);

// Ensure upload root exists
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

// ---------- Helpers ----------
function deriveThumbKey(fileKey) {
  // user-uploads/<userId>/posts/<uuid>.<ext> -> user-uploads/<userId>/posts/<uuid>_thumb.jpg
  return fileKey.replace(/\.[^.]+$/, "_thumb.jpg");
}

function getLocalPath(key) {
  return path.join(UPLOAD_ROOT, key);
}

async function objectExists(key) {
  try {
    await fs.promises.access(getLocalPath(key));
    return true;
  } catch {
    return false;
  }
}

async function readFileBuffer(key) {
  return fs.promises.readFile(getLocalPath(key));
}

async function saveFile(key, buffer) {
  const fullPath = getLocalPath(key);
  const dir = path.dirname(fullPath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
}

// ---------- Core ----------
async function processOne(p) {
  const { _id, fileKey, fileMime } = p;
  const thumbKey = deriveThumbKey(fileKey);

  // Idempotence: if thumb already exists, just mark done
  if (await objectExists(thumbKey)) {
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

  // If source file doesn't exist locally, we can't make a thumb
  if (!(await objectExists(fileKey))) {
    // Fail silently or log error? If file is missing, we can't resize.
    // Maybe verify if it's on S3? But we differ to local only now.
    // Let's mark as error.
    const msg = "Source file missing local";
    await Post.updateOne({ _id }, { thumbError: msg, thumbPending: false });
    return { id: _id, status: "error", error: msg };
  }

  try {
    const input = await readFileBuffer(fileKey);
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

    await saveFile(thumbKey, out);
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
  console.log("[thumbWorker] Mongo connected (Local Storage Mode)");

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
