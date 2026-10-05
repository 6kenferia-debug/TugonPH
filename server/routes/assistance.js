const express = require("express");
const controller = require("../controllers/assistanceController");
const { authenticate, optionalAuthenticate } = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { resolutionProofUpload } = require("../middleware/upload");
const { asyncRoute: storageRoute, saveAssistanceProof } = require("../controllers/storageController");

const router = express.Router();

router.get("/", authenticate, controller.asyncRoute(controller.list));
router.post("/", optionalAuthenticate, controller.asyncRoute(controller.create));
router.get("/:id", authenticate, controller.asyncRoute(controller.getById));
router.get("/:id/history", authenticate, controller.asyncRoute(controller.getHistory));
router.post("/:id/resolution-proof", authenticate, authorize("admin"), resolutionProofUpload, storageRoute(saveAssistanceProof));
router.put("/:id", authenticate, authorize("admin"), controller.asyncRoute(controller.update));
router.delete("/:id", authenticate, authorize("admin"), controller.asyncRoute(controller.remove));

module.exports = router;