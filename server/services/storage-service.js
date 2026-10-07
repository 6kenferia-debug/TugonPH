const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { BlobNotFoundError, del, head, put } = require("@vercel/blob");

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

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(relativePath, buffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
    });
    return { filename, relativePath, url: blob.url };
  }

  const absolutePath = safeResolve(root, relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer, { flag: "wx", mode: 0o600 });

  return { filename, relativePath, absolutePath };
}

async function removeStoredFile(stored) {
  if (stored.url) {
    await del(stored.url);
    return;
  }
  await fs.rm(stored.absolutePath, { force: true });
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

  if (
    parsed.protocol === "https:" &&
    (
      parsed.hostname === "public.blob.vercel-storage.com" ||
      parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    ) &&
    process.env.BLOB_READ_WRITE_TOKEN
  ) {
    await del(parsed.toString());
    return true;
  }

  const publicApiUrl = process.env.PUBLIC_API_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api`
      : `http://localhost:${process.env.PORT || 5000}/api`);
  const configuredBase = new URL(publicApiUrl);
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

async function removeOwnedPublicFileUrl(fileUrl, kind, ownerId) {
  if (typeof fileUrl !== "string" || !/^[a-f\d]{24}$/i.test(ownerId)) return false;

  let parsed;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return false;
  }

  let relativePath;
  const blobUrl = parsed.protocol === "https:" &&
    (
      parsed.hostname === "public.blob.vercel-storage.com" ||
      parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    );

  if (blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    } catch {
      return false;
    }
  } else {
    const publicApiUrl = process.env.PUBLIC_API_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api`
        : `http://localhost:${process.env.PORT || 5000}/api`);
    const configuredBase = new URL(publicApiUrl);
    const prefix = "/api/uploads/";
    if (parsed.origin !== configuredBase.origin || !parsed.pathname.startsWith(prefix)) {
      return false;
    }
    try {
      relativePath = decodeURIComponent(parsed.pathname.slice(prefix.length));
    } catch {
      return false;
    }
  }

  const ownedPathByKind = {
    profile: new RegExp(`^profile/${ownerId}/[a-f\\d-]+\\.(?:jpg|png|webp|gif)$`, "i"),
    "complaint-proof": new RegExp(
      `^resolution/complaints/${ownerId}/[a-f\\d-]+\\.(?:jpg|png|webp)$`,
      "i",
    ),
    "assistance-proof": new RegExp(
      `^resolution/assistance/${ownerId}/[a-f\\d-]+\\.(?:jpg|png|webp)$`,
      "i",
    ),
  };
  if (!ownedPathByKind[kind]?.test(relativePath)) return false;

  if (blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      await head(fileUrl);
    } catch (error) {
      if (error instanceof BlobNotFoundError) return false;
      throw error;
    }
    await del(fileUrl);
    return true;
  }

  const absolutePath = safeResolve(PUBLIC_ROOT, relativePath);
  let realPath;
  try {
    realPath = await fs.realpath(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const realPublicRoot = await fs.realpath(PUBLIC_ROOT);
  if (realPath !== realPublicRoot && !realPath.startsWith(`${realPublicRoot}${path.sep}`)) {
    return false;
  }
  try {
    await fs.rm(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  return true;
}

function publicFileUrl(stored) {
  if (stored.url) return stored.url;
  const base = (process.env.PUBLIC_API_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api`
      : `http://localhost:${process.env.PORT || 5000}/api`)).replace(/\/+$/, "");
  const encodedPath = stored.relativePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/uploads/${encodedPath}`;
}

module.exports = {
  EXTENSION_BY_MIME,
  PUBLIC_ROOT,
  UPLOAD_ROOT,
  getPublicFilePath,
  removeOwnedPublicFileUrl,
  publicFileUrl,
  removePublicFileUrl,
  removeStoredFile,
  safeResolve,
  saveFile,
};