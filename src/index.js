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
import storageRoutes from "./routes/storage.js";

const app = express();
const PORT = process.env.PORT || 4060;
// app.listen(PORT, "0.0.0.0", () => console.log(`API running on :${PORT}`));

app.set("trust proxy", 1);

// Security & core middleware
app.use(helmet());
app.use((req, res, next) => {
  console.log("Incoming Origin:", req.headers.origin);
  console.log("Request Method:", req.method);
  console.log("Request Path:", req.path);
  console.log("Request IP:", req.ip);
  console.log("X-Forwarded-For:", req.headers["x-forwarded-for"]);
  next();
});
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://memorisehub.com",
      "https://www.memorisehub.com",
      "http://72.61.228.4.nip.io",
      "https://72.61.228.4.nip.io",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

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
app.use("/api/storage", storageRoutes);

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

