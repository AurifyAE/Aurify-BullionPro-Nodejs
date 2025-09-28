import express from "express";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  createCostCenter,
  getAllCostCenters,
  getCostCenterById,
  updateCostCenter,
  deleteCostCenter,
  permanentDeleteCostCenter,
  restoreCostCenter,
} from "../../controllers/modules/CostCenterMasterController.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", createCostCenter);
router.get("/", getAllCostCenters);
router.get("/:id", getCostCenterById);
router.put("/:id", updateCostCenter);
router.delete("/:id", deleteCostCenter);
router.delete("/:id/permanent", permanentDeleteCostCenter);
router.patch("/:id/restore", restoreCostCenter);

export default router;
