// index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import compression from "compression";
import { connectDB } from "./config/db.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import trophyRoutes from "./routes/trophies.js";
import reportRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import billingRoutes from "./routes/billing.js";
import fileRoutes from "./routes/files.js";
import metaRoutes from "./routes/meta.js";

const app = express();
const PORT = process.env.PORT || 4060;
// app.listen(PORT, "0.0.0.0", () => console.log(`API running on :${PORT}`));

app.set("trust proxy", 1);

// Security & core middleware
app.use(helmet());
app.use(
  cors({
    origin: ["https://72.61.228.4", "http://72.61.228.4"],
    credentials: true
  })
);


app.use(express.json({ limit: "2mb" }));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

app.use(
  rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true })
);

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/trophies", trophyRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/files", fileRoutes);

// 404 + error handler
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// Start
connectDB()
  .then(() =>
    app.listen(PORT, "0.0.0.0", () => console.log(`API running on :${PORT}`))
  )
  .catch((e) => {
    console.error("DB connection failed:", e);
    process.exit(1);
  });
