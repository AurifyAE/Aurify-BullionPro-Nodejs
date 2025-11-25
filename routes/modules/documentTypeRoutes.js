// src/routes/documentType.routes.js
import { Router } from "express";
import DocumentTypeController from "../../controllers/modules/DocumentTypeController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = Router();

// Protect all routes
router.use(authenticateToken);

// CRUD Routes
router.post("/", DocumentTypeController.createDocumentType);
router.get("/", DocumentTypeController.getAllDocumentTypes);
router.get("/:id", DocumentTypeController.getDocumentTypeById);
router.put("/:id", DocumentTypeController.updateDocumentType);
router.delete("/:id", DocumentTypeController.deleteDocumentType);

export default router;

