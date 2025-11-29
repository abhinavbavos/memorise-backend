import User from "../models/User.js";
import Payment from "../models/Payment.js";
import Setting from "../models/Setting.js";
import { v4 as uuidv4 } from "uuid";
import Joi from "joi";

// Placeholders for Stripe/Razorpay flow
// POST /billing/checkout-session  (auth required)
export async function checkoutSession(req, res) {
  const schema = Joi.object({ plan: Joi.string().valid("premium").required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const settings = (await Setting.findOne().lean()) || {};
  const price = Number(settings.premiumPrice ?? 10);
  const currency = settings.premiumCurrency || "USD";
  const periodMonths = Number(settings.premiumPeriodMonths ?? 12);

  const sessionId = uuidv4(); // mock "checkout session"
  const payment = await Payment.create({
    userId: req.user.id,
    amount: price,
    currency,
    method: "manual", // mock
    gateway: "mock",
    status: "pending",
    description: `Upgrade to Premium (${periodMonths} months)`,
    sessionId,
    planAtPurchase: "premium",
    meta: { periodMonths },
  });

  // Frontend will "open" this URL; for mock we just display it or call /mock/complete
  const checkoutUrl = `https://mock.payments.local/checkout/${sessionId}`;
  res.json({ checkoutUrl, sessionId, paymentId: payment._id });
}

// In real life this would be a signed webhook. For mock we provide:
export async function mockComplete(req, res) {
  const schema = Joi.object({ sessionId: Joi.string().required() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });

  const pay = await Payment.findOne({ sessionId: value.sessionId });
  if (!pay) return res.status(404).json({ error: "Session not found" });
  if (pay.status === "completed")
    return res.json({ ok: true, alreadyCompleted: true });

  // mark payment success
  pay.status = "completed";
  await pay.save();

  // upgrade plan
  const settings = (await Setting.findOne().lean()) || {};
  const periodMonths = Number(settings.premiumPeriodMonths ?? 12);
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

  await User.updateOne(
    { _id: pay.userId },
    {
      plan: "premium",
      ...(User.schema.path("planValidUntil")
        ? { planValidUntil: periodEnd }
        : {}),
    }
  );
  res.json({ ok: true, plan: "premium", periodEnd });
}

// GET /billing/me  — show current plan & validity
export async function getMyBilling(req, res) {
  const user = await User.findById(req.user.id)
    .select("plan planValidUntil")
    .lean();
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json(user);
}
