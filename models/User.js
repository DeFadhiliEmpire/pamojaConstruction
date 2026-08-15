const mongoose = require("mongoose");

const ROLES = {
  USER: "user",
  ADMIN: "admin",
};

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, select: false },
    fullName: { type: String, required: true, trim: true },
    isMfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, select: false },
    oauthProvider: { type: String, enum: ["google", null], default: null },
    oauthId: { type: String, default: null, index: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    lastLogin: { type: Date },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

module.exports = { User, ROLES };
