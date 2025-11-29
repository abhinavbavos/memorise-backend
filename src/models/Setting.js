import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: "My App" },
    siteLogoUrl: String,
    contactEmail: String,
    maintenanceMode: { type: Boolean, default: false },
    paymentGatewayKey: String,
    paymentGatewaySecret: String,
    customCss: String,
    customJs: String,
    premiumPrice: { type: Number, default: 10 },
    premiumCurrency: { type: String, default: "USD" },
    premiumPeriodMonths: { type: Number, default: 12 },
    reportAutoFlagThreshold: { type: Number, default: 3 },
  },
  { timestamps: true }
);

export default mongoose.model("Setting", settingSchema);
