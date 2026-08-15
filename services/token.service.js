const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { RefreshToken } = require("../models/RefreshToken");

function createAccessToken(user) {
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    type: "access",
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

async function createRefreshToken(user) {
  const rawToken = crypto.randomBytes(64).toString("hex");

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 100);

  const refreshToken = new RefreshToken({
    userId: user._id,
    tokenHash,
    expiresAt,
  });

  await refreshToken.save();

  return rawToken;
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { createAccessToken, createRefreshToken, hashRefreshToken };
