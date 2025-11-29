// services/s3SignedGet.js
import { getPresignedGetURL } from "../config/s3.js";

/**
 * Return a short-lived signed GET URL for an S3 object.
 * @param {string} key - S3 key (e.g., "user-uploads/<uid>/posts/<id>_thumb.jpg")
 * @param {number} expiresIn - seconds to expire (default 3600 = 1 hour)
 */
export async function getSignedGetUrl(key, expiresIn = 3600) {
  return getPresignedGetURL({ key, expires: expiresIn });
}
