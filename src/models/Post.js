import mongoose from "mongoose";

// models/Post.js
const postSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },

    // Lock to your predefined set
    category: {
      type: String,
      enum: ["Awards", "Certificates", "Academics", "Sports", "Internship"],
      required: true,
    },

    // S3 object details
    fileKey: { type: String, required: true },
    fileMime: {
      type: String,
      required: true,
      enum: [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "application/pdf",
      ],
    },
    fileSize: { type: Number, required: true },

    // Thumbnails
    thumbKey: String,
    // Local worker pipeline state
    thumbPending: { type: Boolean, default: false, index: true },
    thumbAttempts: { type: Number, default: 0 },
    thumbError: { type: String, default: "" },

    status: {
      type: String,
      enum: ["active", "hidden", "flagged", "removed"],
      default: "active",
      index: true,
    },
    removedAt: { type: Date, default: null },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },

  { timestamps: true }
);

// Helpful indexes for common queries
postSchema.index({ userId: 1, status: 1, createdAt: -1 }); // profile feed
postSchema.index({ userId: 1, category: 1, status: 1 }); // category tabs
postSchema.index({ thumbPending: 1, status: 1, createdAt: 1 }); // worker polling

export default mongoose.model("Post", postSchema);
