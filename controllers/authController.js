import crypto from "crypto";
import { promisify } from "util";
import jwt from "jsonwebtoken";
import User from "./../models/User.js"; // Note: Capitalized User model path
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import Email from "./../utils/email.js";
import { OAuth2Client } from "google-auth-library";

// ------------------------------------------------------------------
// GOOGLE AUTHENTICATION CONFIG & KEYS
// ------------------------------------------------------------------
// Lazily constructed: ESM hoists imports, so dotenv.config() in server.js
// hasn't run yet when this module first evaluates. Build the client on
// first use, when process.env is populated.
let oauthClient;
const getOAuthClient = () => {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
  }
  return oauthClient;
};

// The dev machine's system clock is ~65 min behind real time, which trips
// verifyIdToken's hardcoded 5-min iat tolerance ("Token used too early").
// This public static is the only skew knob; keep it comfortably above the
// drift (70 min). Revert to the default 300 once the OS clock is synced.
OAuth2Client.CLOCK_SKEW_SECS_ = 4200;

let googleKeys = [];
let keysFetchedAt = 0;

async function getGooglePublicKey(kid) {
  if (!googleKeys || Date.now() - keysFetchedAt > 3600000) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    const data = await res.json();
    googleKeys = data.keys;
    keysFetchedAt = Date.now();
  }
  return googleKeys.find((k) => k.kid === kid);
}

// Find an existing user by googleId OR email, or create a brand new one
// from the verified Google profile. Shared by both the idToken flow (GSI)
// and the OAuth authorization-code flow.
async function findOrCreateGoogleUser(payload) {
  const { sub: googleId, email, name, picture } = payload;

  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (!user) {
    // Generate a base username from Google display name or email prefix
    let baseUsername = name
      ? name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 18)
      : email.split("@")[0].replace(/[^a-z0-9_]/g, "").slice(0, 18);

    // Ensure minimum length
    if (baseUsername.length < 3) baseUsername = baseUsername.padEnd(3, "0");

    // Deduplicate: try base, then base_2, base_3, ...
    let username = baseUsername;
    let suffix = 2;
    while (await User.exists({ username })) {
      username = `${baseUsername}_${suffix}`;
      suffix++;
    }

    user = await User.create({
      username,
      email,
      avatar: picture,
      googleId,
      status: "online",
      authMethod: "google",
    });
  } else {
    // Update real-time status and link Google ID if user registered locally before
    user.status = "online";
    if (!user.googleId) {
      user.googleId = googleId;
      user.authMethod = "google";
    }
    await user.save({ validateBeforeSave: false });
  }

  return user;
}

// Step 1 of the OAuth authorization-code flow: bounce the user to Google's
// consent screen. Redirect URL is the authorized callback (GOOGLE_CALLBACK_URL).
export const googleOAuthStart = (req, res, next) => {
  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL ||
    `${req.protocol}://${req.get("host")}/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    access_type: "offline",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

// Step 2: Google redirects here with ?code=... Exchange the code for tokens
// using the client secret, verify the id_token, then log in / create the user
// and land them on the dashboard.
export const googleOAuthCallback = catchAsync(async (req, res, next) => {
  const { code, error } = req.query;

  if (error) {
    return next(new AppError("Google sign-in was cancelled or denied.", 401));
  }
  if (!code) {
    return next(new AppError("Missing Google authorization code", 400));
  }

  const redirectUri =
    process.env.GOOGLE_CALLBACK_URL ||
    `${req.protocol}://${req.get("host")}/auth/google/callback`;

  const { tokens } = await getOAuthClient().getToken({
    code,
    redirect_uri: redirectUri,
  });

  if (!tokens || !tokens.id_token) {
    return next(new AppError("Google sign-in failed: no id_token returned", 401));
  }

  const ticket = await getOAuthClient().verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  const user = await findOrCreateGoogleUser(payload);

  // Set the JWT cookie so the browser is authenticated, then redirect home
  setAuthCookie(user, req, res);
  res.redirect("/");
});

// Google Sign-In via Google Identity Services (GSI) popup: verifies the
// client-issued idToken directly.
export const googleAuth = catchAsync(async (req, res, next) => {
  const { idToken } = req.body;
  if (!idToken) {
    return next(new AppError("Missing Google idToken", 400));
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded) return next(new AppError("Invalid Google token", 401));

  const { header, payload } = decoded;

  // Check token expiry
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    return next(new AppError("Google token has expired. Please sign in again.", 401));
  }

  const key = await getGooglePublicKey(header.kid);
  if (!key) return next(new AppError("Unknown Google signing key", 401));

  const publicKey = crypto.createPublicKey({ format: "jwk", key });
  const signature = Buffer.from(decoded.signature, "base64url");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(idToken.split(".").slice(0, 2).join("."));
  const valid = verifier.verify(publicKey, signature);
  if (!valid) return next(new AppError("Invalid Google token signature", 401));

  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
    return next(new AppError("Invalid Google token audience", 401));
  }

  const user = await findOrCreateGoogleUser(payload);

  // 2. Issue JWT cookie/token
  createSendToken(user, 200, req, res);
});

// ------------------------------------------------------------------
// JWT & COOKIE HELPERS
// ------------------------------------------------------------------
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "90d",
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = setAuthCookie(user, req, res);

  // Strip password from the output payload
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

// Sets the httpOnly JWT cookie; returns the token (used by both JSON login
// responses and the Google OAuth redirect flow).
const setAuthCookie = (user, req, res) => {
  const token = signToken(user._id);

  res.cookie("jwt", token, {
    expires: new Date(
      Date.now() +
        (process.env.JWT_COOKIE_EXPIRES_IN || 90) * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  });

  return token;
};

// ------------------------------------------------------------------
// AUTHENTICATION CONTROLLERS
// ------------------------------------------------------------------

// 1. SIGNUP
export const signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    username: req.body.username || req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    phoneNumber: req.body.phoneNumber,
    status: "online",
  });

  createSendToken(newUser, 201, req, res);
});

// 2. LOGIN
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError("Please provide email and password!", 400));
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect email or password", 401));
  }

  // Set user online upon successful login
  user.status = "online";
  await user.save({ validateBeforeSave: false });

  createSendToken(user, 200, req, res);
});

// 3. LOGOUT
export const logout = catchAsync(async (req, res, next) => {
  // Set status offline if user is currently attached
  if (req.user) {
    await User.findByIdAndUpdate(req.user.id, { status: "offline" });
  }

  res.cookie("jwt", "loggedout", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  if (req.headers.accept && req.headers.accept.includes("html")) {
    res.redirect("/");
    return;
  }
  res.status(200).json({ status: "success" });
});

// 4. PROTECT MIDDLEWARE
export const protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token || token === "loggedout") {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401),
    );
  }

  const decoded = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET || "fallback-super-secret-key-change-this",
  );

  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        "The user belonging to this token does no longer exist.",
        401,
      ),
    );
  }

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError("User recently changed password! Please log in again.", 401),
    );
  }

  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// 5. IS LOGGED IN
export const isLoggedIn = async (req, res, next) => {
  if (req.cookies && req.cookies.jwt) {
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET || "fallback-super-secret-key-change-this",
      );
      const currentUser = await User.findById(decoded.id);

      if (!currentUser || currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      res.locals.user = currentUser.toObject();
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

// 6. RESTRICT TO
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action", 403),
      );
    }
    next();
  };
};

// 7. REAL-TIME STATUS UPDATE CONTROLLER
export const updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!["online", "away", "offline"].includes(status)) {
    return next(new AppError("Invalid status value", 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { status },
    { new: true, runValidators: true },
  );

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

// ------------------------------------------------------------------
// PASSWORD MANAGEMENT
// ------------------------------------------------------------------

export const forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError("There is no user with that email address", 404));
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${req.protocol}://${req.get(
    "host",
  )}/api/v1/users/resetPassword/${resetToken}`;

  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
      resetToken,
    });
  } catch (err) {
    console.error("Email send error:", err.message);

    if (process.env.NODE_ENV === "development") {
      return res.status(200).json({
        status: "success",
        message: "Email sending failed or unconfigured in dev mode, but resetToken is returned for Postman testing.",
        resetToken,
        resetURL,
      });
    }

    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        "There was an error sending the email. Try again later!",
        500,
      ),
    );
  }
});

export const resetPassword = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Token is invalid or has expired", 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  createSendToken(user, 200, req, res);
});

export const updatePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");

  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError("Your current password is wrong", 401));
  }

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  createSendToken(user, 200, req, res);
});
