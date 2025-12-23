import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import { createOpeningFixing } from "../../controllers/modules/OpeningFixingController.js";

const router = express.Router();
router.use(authenticateToken);

router.post("/", createOpeningFixing);

export default router;
