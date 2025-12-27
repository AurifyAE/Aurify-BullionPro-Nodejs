import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  createOpeningFixing,
  deleteOpeningFixing,
  getAllOpeningFixings,
  getOpeningFixingById,
  updateOpeningFixing
} from "../../controllers/modules/OpeningFixingController.js";

const router = express.Router();
router.use(authenticateToken);

router.post("/", createOpeningFixing);
router.get("/", getAllOpeningFixings);
router.get("/:id", getOpeningFixingById); 
router.put("/:id", updateOpeningFixing);
router.delete("/:id", deleteOpeningFixing);

export default router;
