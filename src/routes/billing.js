import { Router } from "express";
import { auth } from "../middleware/auth.js";
import {
  checkoutSession,
  mockComplete,
  getMyBilling,
} from "../controllers/billingController.js";

const r = Router();
r.post("/checkout-session", auth(), checkoutSession);
r.post("/mock/complete", mockComplete); // no auth: simulates gateway webhook
r.get("/me", auth(), getMyBilling);

export default r;
