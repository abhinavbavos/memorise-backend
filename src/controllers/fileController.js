// controllers/fileController.js
import { getPresignedGetURL } from "../config/storage.js";

export async function signGet(req, res) {
  const { key, expires } = req.query;
  if (!key) return res.status(400).json({ error: "key required" });

  // Optional ownership check:
  // if (!key.startsWith(`user-uploads/${req.user.id}/`)) {
  //   return res.status(403).json({ error: "Forbidden" });
  // }

  const url = await getPresignedGetURL({
    key,
    expires: Number(expires) || 300, // 5 minutes
  });

  res.json({ url });
}
