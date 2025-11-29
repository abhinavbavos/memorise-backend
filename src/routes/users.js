// routes/users.js
import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { enforcePlanForCover } from "../middleware/planGuard.js";
import {
  getUser,
  updateMe,
  presignAvatar,
  presignCover,
  setAvatar,
  setCover,
  getPublicProfile,
} from "../controllers/userController.js";
import User from "../models/User.js";

const r = Router();

// Current user's profile
r.get("/me", auth(), async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("-passwordHash").lean();
    if (!u) return res.status(404).json({ error: "Not found" });
    res.json(u);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Private (owner/admin)
r.get("/:id", auth(), getUser); // owner or admin
r.put("/me", auth(), updateMe); // update caller

// Avatars & cover (plan-enforced for cover)
r.get("/me/presign/avatar", auth(), presignAvatar);
r.get("/me/presign/cover", auth(), enforcePlanForCover, presignCover);
r.post("/me/avatar", auth(), setAvatar);
r.post("/me/cover", auth(), enforcePlanForCover, setCover);

// Public profile by publicId
r.get("/public/:publicId", getPublicProfile);

export default r;
