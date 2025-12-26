import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createDesignation } from "../../controllers/modules/designationController.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", createDesignation);

export default router;