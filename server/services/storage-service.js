const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const UPLOAD_ROOT = path.resolve(__dirname, "..", "uploads");
const PUBLIC_ROOT = path.join(UPLOAD_ROOT, "public");

const EXTENSION_BY_MIME = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
});

function safeResolve(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error("Invalid stored file path.");
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Stored file path is outside its upload directory.");
  }
  return resolved;
}

function requireObjectId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new Error("Invalid file owner or record identifier.");
  }
  return value;
}

function getUploadLocation(kind, ownerId) {
  if (kind === "profile") {
    return {
      root: PUBLIC_ROOT,
      directory: path.join("profile", requireObjectId(ownerId)),
    };
  }
  if (kind === "complaint-proof") {
    return {
      root: PUBLIC_ROOT,
      directory: path.join("resolution", "complaints", requireObjectId(ownerId)),
    };
  }
  if (kind === "assistance-proof") {
    return {
      root: PUBLIC_ROOT,
      directory: path.join("resolution", "assistance", requireObjectId(ownerId)),
    };
  }
  throw new Error("Unsupported upload purpose.");
}

async function saveFile({ kind, ownerId, buffer, mimeType }) {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) throw new Error("Unsupported file type.");
  const { root, directory } = getUploadLocation(kind, ownerId);
  const filename = `${crypto.randomUUID()}${extension}`;
  const relativePath = path.join(directory, filename).split(path.sep).join("/");
  const absolutePath = safeResolve(root, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: "wx", mode: 0o600 });

  return { filename, relativePath, absolutePath };
}

function getPublicFilePath(relativePath) {
  if (typeof relativePath !== "string") throw new Error("Invalid public file path.");
  const normalized = relativePath.replace(/\\/g, "/");
  const profileMatch = normalized.match(/^profile\/([a-f\d]{24})\/([a-f\d-]+\.(?:jpg|png|webp|gif))$/i);
  const resolutionMatch = normalized.match(/^resolution\/(complaints|assistance)\/([a-f\d]{24})\/([a-f\d-]+\.(?:jpg|png|webp))$/i);
  if (!profileMatch && !resolutionMatch) throw new Error("Invalid public file path.");
  return safeResolve(PUBLIC_ROOT, normalized);
}

async function removePublicFileUrl(fileUrl) {
  if (typeof fileUrl !== "string") return false;
  let parsed;
  try {
    parsed = new URL(fileUrl, "http://localhost");
  } catch {
    return false;
  }
  const configuredBase = new URL(
    process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5000}/api`,
  );
  if (parsed.origin !== configuredBase.origin) return false;
  const prefix = "/api/uploads/";
  if (!parsed.pathname.startsWith(prefix)) return false;

  let relativePath;
  try {
    relativePath = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return false;
  }
  const absolutePath = safeResolve(PUBLIC_ROOT, relativePath);
  await fs.rm(absolutePath, { force: true });
  return true;
}

function publicFileUrl(relativePath) {
  const base = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5000}/api`).replace(/\/+$/, "");
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/uploads/${encodedPath}`;
}

module.exports = {
  EXTENSION_BY_MIME,
  PUBLIC_ROOT,
  UPLOAD_ROOT,
  getPublicFilePath,
  publicFileUrl,
  removePublicFileUrl,
  safeResolve,
  saveFile,
};