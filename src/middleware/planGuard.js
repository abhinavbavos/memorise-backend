// middleware/planGuard.js
import mongoose from "mongoose";
import PlanLimits from "../models/PlanLimits.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

function ownerQuery(userId) {
  // tolerate different historical owner fields
  const ors = [{ userId: userId }, { user: userId }, { createdBy: userId }];
  if (mongoose.isValidObjectId(userId)) {
    const oid = new mongoose.Types.ObjectId(userId);
    ors.push({ userId: oid }, { user: oid }, { createdBy: oid });
  }
  return { $or: ors };
}

async function getEffectivePlan(userId, tokenPlan) {
  const u = await User.findById(userId).select("plan").lean();
  return u?.plan || tokenPlan || "basic";
}

export async function enforcePlanForCover(req, res, next) {
  const plan = await getEffectivePlan(req.user.id, req.user.plan);
  const limits = await PlanLimits.getLimits(plan);
  if (!limits.canChangeCover) {
    return res.status(403).json({ error: "Upgrade to change cover photo" });
  }
  next();
}

export async function enforcePostQuota(req, res, next) {
  try {
    // allow admins to bypass (optional; remove if you want admins limited too)
    if (req.user?.role === "admin") return next();

    const plan = await getEffectivePlan(req.user.id, req.user.plan);
    const limits = await PlanLimits.getLimits(plan);

    // limits.maxPosts will always be defined thanks to the merge in getLimits
    const count = await Post.countDocuments({
      ...ownerQuery(req.user.id),
      // count everything that isn't hard-removed; adjust if you want only "active"
      status: { $ne: "removed" },
    });

    if (count >= limits.maxPosts) {
      return res
        .status(403)
        .json({ error: "Post limit reached. Upgrade plan." });
    }
    next();
  } catch (e) {
    next(e);
  }
}
