const multer = require("multer");
const readFileType = import("file-type").then((module) => module.fileTypeFromBuffer);

const RASTER_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const RESOLUTION_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function uploadSingleFile({ allowedTypes, maxBytes }) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(req, file, callback) {
      if (!allowedTypes.has(file.mimetype)) {
        const error = new Error("Unsupported file type.");
        error.status = 415;
        error.code = "UNSUPPORTED_FILE_TYPE";
        callback(error);
        return;
      }
      callback(null, true);
    },
  }).single("file");

  return (req, res, next) => {
    parser(req, res, (error) => {
      if (error) {
        if (error.code === "LIMIT_FILE_SIZE") {
          error.status = 413;
          error.message = "Uploaded file exceeds the allowed size.";
        }
        return next(error);
      }
      if (!req.file) {
        const missing = new Error("A file is required.");
        missing.status = 400;
        missing.code = "FILE_REQUIRED";
        return next(missing);
      }
      void (async () => {
        const fileTypeFromBuffer = await readFileType;
        const detected = await fileTypeFromBuffer(req.file.buffer);
        if (
          !detected ||
          !allowedTypes.has(detected.mime) ||
          !allowedTypes.has(req.file.mimetype) ||
          detected.mime !== req.file.mimetype
        ) {
          const invalid = new Error("File contents do not match an allowed file type.");
          invalid.status = 415;
          invalid.code = "INVALID_FILE_CONTENT";
          throw invalid;
        }
        req.file.detectedMimeType = detected.mime;
        next();
      })().catch(next);
    });
  };
}

const profileImageUpload = uploadSingleFile({
  allowedTypes: RASTER_IMAGE_TYPES,
  maxBytes: 5 * 1024 * 1024,
});
const resolutionProofUpload = uploadSingleFile({
  allowedTypes: RESOLUTION_TYPES,
  maxBytes: 10 * 1024 * 1024,
});

module.exports = {
  profileImageUpload,
  resolutionProofUpload,
};