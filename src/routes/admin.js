// src/routes/admin.js
import { Router } from "express";
import { auth, requireRole } from "../middleware/auth.js";
import {
  // Dashboard & recents
  dashboard,
  getRecentUsers,
  getRecentSubscriptions,

  // Reports & moderation
  listReports,
  resolveReport,
  bulkResolveReports,
  revertAction,

  // Post moderation
  hidePost,
  removePost,

  // User management/moderation
  listUsers,
  getUserDetail,
  updateUser,
  deleteUser,
  setUserStatus,

  // Payments
  listPayments,
  getPaymentDetail,
  addManualPayment,

  // Settings
  getSettings,
  updateSettings,
} from "../controllers/adminController.js";

const r = Router();

// All admin endpoints require admin auth
r.use(auth(), requireRole("admin"));

/* -------- Dashboard & recents -------- */
r.get("/dashboard", dashboard);
r.get("/users/recent", getRecentUsers); // keep BEFORE /users/:id
r.get("/subscriptions/recent", getRecentSubscriptions);

/* -------- Reports (queue + actions) -------- */
r.get("/reports", listReports); // ?status=open|reviewed|all&type=user|post|all&page=&pageSize=
r.patch("/reports/:id", resolveReport); // { decision:'accept'|'reject', action?:'remove', note? }
r.post("/reports/bulk-resolve", bulkResolveReports);
r.post("/actions/:auditId/revert", revertAction); // revert by audit log id

/* -------- Post moderation (direct) -------- */
r.put("/posts/:id/hide", hidePost);
r.put("/posts/:id/remove", removePost);

/* -------- Users -------- */
r.get("/users", listUsers);
r.get("/users/:id", getUserDetail);
r.put("/users/:id", updateUser);
r.delete("/users/:id", deleteUser);

// Frontend calls PATCH …/status; keep both PATCH & PUT if you want to be lenient
r.patch("/users/:id/status", setUserStatus);
r.put("/users/:id/status", setUserStatus);

/* -------- Payments -------- */
r.get("/payments", listPayments);
r.get("/payments/:id", getPaymentDetail);
r.post("/payments/manual", addManualPayment);

/* -------- Settings -------- */
r.get("/settings", getSettings);
r.put("/settings", updateSettings);

export default r;
