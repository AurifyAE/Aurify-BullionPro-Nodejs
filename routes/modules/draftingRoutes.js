import { Router } from "express";
import DraftingController from "../../controllers/modules/draftingController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { uploadHandler } from "../../utils/fileUpload.js";

const router = Router();

// Protect all routes
router.use(authenticateToken);

// PDF Parsing Route (temporary upload, no permanent storage)
router.post(
  "/parse-pdf",
  uploadHandler({ fieldName: "pdf", useLocalStorage: true, maxFileSize: 10 * 1024 * 1024 }), // 10MB max
  DraftingController.parsePDF
);

// CRUD Routes with optional PDF upload support
router.post(
  "/",
  uploadHandler({ fieldName: "labReportPdf", useLocalStorage: false, maxFileSize: 10 * 1024 * 1024 }), // 10MB max, use S3
  DraftingController.createDraft
);
router.get("/", DraftingController.getAllDrafts);
router.get("/:id", DraftingController.getDraftById);
router.put(
  "/:id",
  uploadHandler({ fieldName: "labReportPdf", useLocalStorage: false, maxFileSize: 10 * 1024 * 1024 }), // 10MB max, use S3
  DraftingController.updateDraft
);
router.delete("/:id", DraftingController.deleteDraft);

export default router;

