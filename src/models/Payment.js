import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "USD" },
  method: { type: String, enum: ["card", "paypal", "manual"], default: "card" },
  status: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  description: String,
  transactionId: String,
  gateway: { type: String, default: "mock" }, // "stripe" | "razorpay" later
  sessionId: { type: String }, // checkout session correlation
  planAtPurchase: { type: String, enum: ["premium"] },
  periodEnd: { type: Date }, // subscription end (optional)
  meta: { type: Object }, // raw gateway / debug info
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Payment", paymentSchema);
