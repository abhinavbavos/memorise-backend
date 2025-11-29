// middleware/ownership.js
import mongoose from "mongoose";

/**
 * Verify that a given S3 key belongs to the authenticated user
 * unless the caller is an admin.
 * Usage:
 *   r.get("/files/sign", auth(), ownS3Key("key"), signGet)
 */
export function ownS3Key(queryParam = "key") {
  return (req, res, next) => {
    // admins can sign anything
    if (req.user?.role === "admin") return next();

    const key = (req.query?.[queryParam] || "").toString();
    if (!key) return res.status(400).json({ error: "key required" });

    const expectedPrefix = `user-uploads/${req.user.id}/`;
    if (!key.startsWith(expectedPrefix)) {
      return res.status(403).json({ error: "Forbidden: not your file" });
    }
    next();
  };
}

/**
 * Validate a Mongo ObjectId in `req.params[paramName]`
 */
export function requireObjectId(paramName = "id") {
  return (req, res, next) => {
    const v = req.params?.[paramName];
    if (!mongoose.isValidObjectId(v)) {
      return res.status(400).json({ error: `Invalid ${paramName}` });
    }
    next();
  };
}
