const app = require("../server/server");

module.exports = (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const apiPath = requestUrl.searchParams.get("__apiPath");
  const pathSegments = apiPath?.split("/");

  if (
    !pathSegments?.length ||
    pathSegments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return res.status(400).json({ error: "Invalid API path." });
  }

  requestUrl.searchParams.delete("__apiPath");
  req.url = `/api/${pathSegments.join("/")}${requestUrl.search}`;
  return app(req, res);
};
