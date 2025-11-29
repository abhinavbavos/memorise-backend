// config/s3.js
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// Generate a presigned PUT URL + the headers the client MUST send
export async function getPresignedPutURL({ key, contentType, expires = 60 }) {
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
  const params = { Bucket: process.env.S3_BUCKET, Key: key };
  if (asDownloadName) {
    params.ResponseContentDisposition = `attachment; filename="${asDownloadName}"`;
  }
  const command = new GetObjectCommand(params);
  return await getSignedUrl(s3Client, command, { expiresIn: expires });
}

export { getPresignedGetURL as getSignedGetURL };
export default s3Client;
