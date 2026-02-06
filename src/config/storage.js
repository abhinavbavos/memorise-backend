// config/storage.js
import jwt from "jsonwebtoken";

// Default to requiring SSE (legacy env var compatibility)
const REQUIRE_SSE =
  String(process.env.REQUIRE_SSE ?? "true").toLowerCase() === "true";

function getLocalSignedUrl(type, key, expires) {
  // expires is in seconds
  const token = jwt.sign({ type, key }, process.env.JWT_SECRET, {
    expiresIn: expires,
  });
  
  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 4060}`;
  
  if (type === "put") {
    return `${baseUrl}/api/storage/upload?key=${encodeURIComponent(key)}&token=${token}`;
  } else {
    // For GET, we return a URL that serves the file
    return `${baseUrl}/api/storage/file/${key}?token=${token}`;
  }
}

// Generate a presigned PUT URL + headers
export async function getPresignedPutURL({ key, contentType, expires = 60 }) {
  const url = getLocalSignedUrl("put", key, expires);
  return { 
    url, 
    key, 
    requiredHeaders: { "Content-Type": contentType || "application/octet-stream" } 
  };
}

export async function getPresignedGetURL({
  key,
  expires = 300,
  asDownloadName,
}) {
  return getLocalSignedUrl("get", key, expires);
}

export { getPresignedGetURL as getSignedGetURL };
export default {}; // No client needed for local
