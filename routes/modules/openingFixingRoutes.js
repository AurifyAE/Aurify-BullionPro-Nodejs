import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  createOpeningFixing,
  getAllOpeningFixings,
  getOpeningFixingById,
} from "../../controllers/modules/OpeningFixingController.js";

const router = express.Router();
router.use(authenticateToken);

router.post("/", createOpeningFixing);
router.get("/", getAllOpeningFixings);
router.get("/:id", getOpeningFixingById); 

export default router;
