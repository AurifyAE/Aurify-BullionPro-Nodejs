// src/routes/classification.routes.js
import { Router } from "express";
import ClassificationController from "../../controllers/modules/ClassificationController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";


const router = Router();

// Protect all routes
router.use(authenticateToken);
// CRUD Routes
router.post("/", ClassificationController.createClassification);
router.get("/", ClassificationController.getAllClassifications);
router.get("/:id", ClassificationController.getClassificationById);
router.put("/:id", ClassificationController.updateClassification);
router.delete("/:id", ClassificationController.deleteClassification);

export default router;