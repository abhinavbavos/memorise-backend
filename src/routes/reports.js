import { Router } from "express";
import { auth } from "../middleware/auth.js";
import { createReport } from "../controllers/reportController.js";
import rateLimit from "express-rate-limit";

const r = Router();
const reportLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

// Allow anonymous reports
r.post("/", auth(false), reportLimiter, createReport);

export default r;
