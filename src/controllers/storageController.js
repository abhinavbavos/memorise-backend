import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import { pipeline } from "stream/promises";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function uploadFile(req, res) {
  const { token, key } = req.query;

  if (!token || !key) {
    return res.status(400).json({ error: "Missing token or key" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.key !== key || decoded.type !== "put") {
      return res.status(403).json({ error: "Invalid token for this operation" });
    }
  } catch (err) {
    return res.status(403).json({ error: "Token expired or invalid" });
  }

  // Ensure directory for key exists (files might be in subfolders like user-uploads/123/...)
  const filePath = path.join(UPLOAD_DIR, key);
  const dir = path.dirname(filePath);
  
  // Security check: prevent directory traversal
  if (!filePath.startsWith(UPLOAD_DIR)) {
     return res.status(400).json({ error: "Invalid key" });
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const writeStream = fs.createWriteStream(filePath);
    await pipeline(req, writeStream);
    res.json({ ok: true, key });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}

export async function getFile(req, res) {
  const { token } = req.query;
  const { key } = req.params;
  // key can contain slashes, need to ensure express routing handles it or we decode it
  // Actually, express params like :key* might be needed if key has slashes.
  // Alternatively, we can pass key in query if we want, but S3 usually has path based.
  // Let's assume req.params.0 for wildcard if we configure route that way.
  
  // Re-construct the full key from params if using wildcard
  const fullKey = req.params[0] ? req.params[0] : key;

  if (!token) {
    // Ideally we require token to mimic private S3 bucket
    // But if we want public read, we can skip.
    // The previous code had "expires" for GET urls, implying they are temporary.
    // So we should enforce token.
    return res.status(400).json({ error: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.key !== fullKey || decoded.type !== "get") {
      // Allow if token key matches exactly
       return res.status(403).json({ error: "Invalid token" });
    }
  } catch (err) {
    // Token expired
    return res.status(403).json({ error: "Link expired" });
  }

  const filePath = path.join(UPLOAD_DIR, fullKey);
  
  // Security check
  if (!filePath.startsWith(UPLOAD_DIR)) {
    return res.status(400).json({ error: "Invalid key" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.sendFile(filePath);
}
