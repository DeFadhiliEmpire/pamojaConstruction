const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const speakeasy = require("speakeasy");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const { User } = require("./models/User");

const {
  generateSecret,
  generateQRCode,
  encrypt,
  verifyToken,
} = require("./services/mfa.services");

const {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
} = require("./services/token.service");

const { RefreshToken } = require("./models/RefreshToken");

const router = express.Router();

router.post("/auth/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ message: "email password and fullName required " });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "An account with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    //Generate secret for TOTP
    const secret = generateSecret(normalizedEmail);

    const encryptedSecret = encrypt(secret.base32);

    const user = new User({
      email: normalizedEmail,
      password: hashedPassword,
      fullName,
      isMfaEnabled: false,
      mfaSecretEncrypted: encryptedSecret,
    });

    await user.save();

    //Generate QR code for TOTP setup
    const qrCode = await generateQRCode(secret.otpauth_url);

    res.status(201).json({
      message: "Account Created. MFA enrollment required.",
      mfaRequired: true,
      userId: user._id,
      qrCode,
    });
  } catch (err) {
    console.error("Error registering User:", err);
    res.status(500).json({ message: "Internal Server Error registering user" });
  }
});

//Verify and enable MFA
router.post("/auth/verify-registration-mfa", async (req, res) => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({
        message: "User ID and MFA token required",
      });
    }

    const user = await User.findById(userId).select("+mfaSecretEncrypted");

    if (!user) {
      return res.status(404).json({ message: "user not found 1" });
    }

    if (user.isMfaEnabled) {
      return res.status(400).json({ message: "MFA is already enabled" });
    }

    const valid = verifyToken(user.mfaSecretEncrypted, token);

    if (!valid) {
      return res.status(400).json({ message: "Invalid MFA token" });
    }

    user.isMfaEnabled = true;
    await user.save();

    res.json({
      message: "MFA enabled sucessfully. Your account is now active.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to verify MFA enrollment." });
  }
});

//Login with credentials+MFA
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+password +mfaSecretEncrypted");

    if (
      !user ||
      !user.password ||
      !(await bcrypt.compare(password, user.password))
    ) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    if (!user.isMfaEnabled) {
      return res.status(403).json({
        message: "MFA enrollment is required before login",
        mfaEnrolmentRequired: true,
        userId: user._id,
      });
    }

    const challenge = jwt.sign(
      { userId: user._id.toString(), type: "mfa_challenge" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );

    res.json({
      message: "Password verified. MFA verification required.",
      mfaRequired: true,
      challenge,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error while login" });
  }
});

//verify MFA token and complete Login
router.post("/auth/verify-login-mfa", async (req, res) => {
  try {
    const { challenge, token } = req.body;

    if (!challenge || !token) {
      return res
        .status(400)
        .json({ message: "MFA challange and token are required" });
    }

    let decoded;

    try {
      decoded = jwt.verify(challenge, process.env.JWT_SECRET);
    } catch (err) {
      console.error(err);
      return res
        .status(401)
        .json({ message: "MFA challenge expired or invalid" });
    }

    if (decoded.type !== "mfa_challenge") {
      return res.status(401).json({ message: "Inalid MFA challange" });
    }

    const user = await User.findById(decoded.userId).select(
      "+mfaSecretEncrypted",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isMfaEnabled) {
      return res.status(403).json({ message: "MFA is not enabled" });
    }

    const valid = verifyToken(user.mfaSecretEncrypted, token);

    if (!valid) {
      return res.status(401).json({ message: "Invalid MFA code" });
    }

    user.lastLogin = new Date();
    await user.save();

    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user);

    res.json({ message: "Login successful", accessToken, refreshToken });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "MFA authentication failed" });
  }
});

//refresh token route
router.post("/auth/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const tokenHash = hashRefreshToken(refreshToken);

    const storedToken = await RefreshToken.findOne({
      tokenHash,
      revokedAt: null,
    });

    if (!storedToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (storedToken.expiresAt < new Date()) {
      storedToken.revokedAt = new Date();

      await storedToken.save();

      return res.status(401).json({ message: "Refresh token expired " });
    }

    const user = await User.findById(storedToken.userId);

    if (!user) {
      return res
        .status(401)
        .json({ message: "User not found by Id from refresh token" });
    }

    //Rotate refresh token
    storedToken.revokedAt = new Date();

    const newRefreshToken = await createRefreshToken(user);

    storedToken.replacedByTokenHash = hashRefreshToken(newRefreshToken);

    await storedToken.save();

    const accessToken = createAccessToken(user);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Token refresh failed" });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.updateOne(
        { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error(err);

    res.status(500).json({ message: "Logout failed Internal server Error" });
  }
});

//configure Google OAuth 2.0 strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        if (!email) {
          return done(null, false, { message: "Google account has no email" });
        }

        let user = await User.findOne({ email });

        if (!user) {
          user = new User({
            email,
            fullName: profile.displayName || "Google User",
            oauthProvider: "google",
            oauthId: profile.id,
            isMfaEnabled: false,
          });
        } else {
          if (user.oauthProvider === null) {
            user.oauthProvider = "google";

            user.oauthId = profile.id;

            await user.save();
          }

          return done(null, user);
        }
      } catch (err) {
        return done(err, null);
      }
    },
  ),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/login?error=authentication_failed`,
        );
      }

      if (!user.isMfaEnabled) {
        const secret = generateSecret(user.email);
        user.mfaSecretEncrypted = encrypt(secret.base32);

        await user.save();

        const qrCode = await generateQRCode(secret.otpauth_url);

        return res.json({
          mfaRequired: true,
          setup: true,
          userId: user._id,
          qrCode,
          message:
            "You must enable MFA. Download an Authenticator app and scan this QR code.",
        });
      }

      //if MFA enabled return challange token
      const challenge = jwt.sign(
        { userId: user._id.toString(), type: "mfa_challenge" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" },
      );

      return res.json({ mfaRequired: true, setup: false, challenge });
    } catch (err) {
      console.error(err);

      return res.redirect(
        `${process.env.FRONTEND_URL}/Login?error=server_error`,
      );
    }
  },
);

router.post("/auth/google/verify-mfa", async (req, res) => {
  try {
    const { challenge, token } = req.body;

    if (!challenge || !token) {
      return res
        .status(400)
        .json({ message: "MFA challange and token are required 12" });
    }

    let decoded;

    try {
      decoded = jwt.verify(challenge, process.env.JWT_SECRET);
    } catch (err) {
      console.error(err);
      return res
        .status(401)
        .json({ message: "MFA challenge expired or invalid in google verify" });
    }

    if (decoded.type !== "mfa_challenge") {
      return res.status(401).json({ message: "Inalid MFA challange" });
    }

    const user = await User.findById(decoded.userId).select(
      "+mfaSecretEncrypted",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isMfaEnabled) {
      return res.status(403).json({ message: "MFA is not enabled" });
    }

    const valid = verifyToken(user.mfaSecretEncrypted, token);

    if (!valid) {
      return res.status(401).json({ message: "Invalid MFA code" });
    }

    user.lastLogin = new Date();
    await user.save();

    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user);

    res.json({ message: "Login successful", accessToken, refreshToken });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "MFA authentication failed" });
  }
});

module.exports = { router };
