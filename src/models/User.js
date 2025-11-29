import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    plan: { type: String, enum: ["basic", "premium"], default: "basic" },
    planValidUntil: { type: Date }, // optional: used by mock billing to set expiry
    avatarKey: String,
    coverKey: String,
    about: String,
    age: Number,
    city: String,
    country: String,
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
      index: true,
    },
    skills: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    publicId: { type: String, default: uuidv4, unique: true },
  },
  { timestamps: true }
);

// Hide sensitive/internal fields in all JSON outputs
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

userSchema.methods.setPassword = async function (pw) {
  this.passwordHash = await bcrypt.hash(pw, 10);
};
userSchema.methods.checkPassword = function (pw) {
  return bcrypt.compare(pw, this.passwordHash);
};

export default mongoose.model("User", userSchema);
