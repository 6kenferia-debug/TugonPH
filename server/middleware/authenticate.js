const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function getUserFromToken(token) {
  if (typeof token !== "string" || !token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const error = new Error("Invalid or expired authentication token.");
    error.status = 401;
    throw error;
  }

  const user = await User.findById(claims.sub);
  if (!user) {
    const error = new Error("Account not found.");
    error.status = 401;
    throw error;
  }
  if (!user.isActive || user.accountStatus !== "approved" || !user.emailVerified) {
    const error = new Error("Account is not approved for access.");
    error.status = 403;
    throw error;
  }

  return user;
}

async function getAuthenticatedUser(req) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }
  return getUserFromToken(token);
}

async function authenticate(req, res, next) {
  try {
    req.user = await getAuthenticatedUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAuthenticate(req, res, next) {
  if (!req.get("authorization")) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = { authenticate, getUserFromToken, optionalAuthenticate };