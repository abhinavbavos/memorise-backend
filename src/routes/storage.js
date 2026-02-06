import express from "express";
import { uploadFile, getFile } from "../controllers/storageController.js";

const router = express.Router();

// PUT /api/storage/upload?key=...&token=...
router.put("/upload", uploadFile);

// GET /api/storage/file/*?token=...
// Using wildcard to match nested paths
router.get("/file/*", getFile);

export default router;
