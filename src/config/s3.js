// config/s3.js
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import jwt from "jsonwebtoken";

const isLocal = process.env.STORAGE_TYPE === "local";

const s3Client = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

// Default to requiring SSE (your bucket policy needs it)
const REQUIRE_SSE =
  String(process.env.REQUIRE_SSE ?? "true").toLowerCase() === "true";

function getLocalSignedUrl(type, key, expires) {
  // expires is in seconds for S3, jwt.sign uses seconds if it is a number
  const token = jwt.sign({ type, key }, process.env.JWT_SECRET, {
    expiresIn: expires,
  });
  
  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 4060}`;
  
  if (type === "put") {
    return `${baseUrl}/api/storage/upload?key=${encodeURIComponent(key)}&token=${token}`;
  } else {
    return `${baseUrl}/api/storage/file/${key}?token=${token}`; // key in path for GET
  }
}

// Generate a presigned PUT URL + the headers the client MUST send
export async function getPresignedPutURL({ key, contentType, expires = 60 }) {
  if (isLocal) {
    const url = getLocalSignedUrl("put", key, expires);
    return { 
      url, 
      key, 
      requiredHeaders: { "Content-Type": contentType || "application/octet-stream" } 
    };
  }

  const cmd = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
    ...(REQUIRE_SSE ? { ServerSideEncryption: "AES256" } : {}),
  });

  const url = await getSignedUrl(s3Client, cmd, { expiresIn: expires });

  const requiredHeaders = {
    "Content-Type": contentType || "application/octet-stream",
    ...(REQUIRE_SSE ? { "x-amz-server-side-encryption": "AES256" } : {}),
  };

  return { url, key, requiredHeaders };
}

export async function getPresignedGetURL({
  key,
  expires = 300,
  asDownloadName,
}) {
  if (isLocal) {
    return getLocalSignedUrl("get", key, expires);
  }

  const params = { Bucket: process.env.S3_BUCKET, Key: key };
  if (asDownloadName) {
    params.ResponseContentDisposition = `attachment; filename="${asDownloadName}"`;
  }
  const command = new GetObjectCommand(params);
  return await getSignedUrl(s3Client, command, { expiresIn: expires });
}

export { getPresignedGetURL as getSignedGetURL };
export default s3Client;
