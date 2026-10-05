function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      const error = new Error("Authentication required.");
      error.status = 401;
      return next(error);
    }
    if (!allowedRoles.includes(req.user.role)) {
      const error = new Error("You do not have permission to perform this action.");
      error.status = 403;
      return next(error);
    }
    return next();
  };
}

module.exports = authorize;