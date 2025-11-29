import mongoose from "mongoose";

const trophySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ["Awards", "Certificates", "Academics", "Sports", "Internship"],
      required: true,
      index: true,
    },
    year: { type: String, default: "" },
    imageKey: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Trophy", trophySchema);
