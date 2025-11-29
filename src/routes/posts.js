import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { enforcePostQuota } from "../middleware/planGuard.js";
import { requireObjectId } from "../middleware/ownership.js";
import {
  presignPostFile,
  createPost,
  listMyPosts,
  listPostsByUser,
  removePost,
  categoryCountsByUser,
} from "../controllers/postController.js";

const r = Router();

r.get("/me/presign", auth(), presignPostFile); // presign endpoint
r.post("/", auth(), enforcePostQuota, createPost);
r.get("/me", auth(), listMyPosts);
r.get("/user/:id", listPostsByUser);
r.get("/user/:id/category-counts", categoryCountsByUser);
r.delete("/:id", auth(), requireObjectId("id"), removePost);

export default r;
