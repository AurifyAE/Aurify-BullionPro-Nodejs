import express from "express";
import {
  createMetalStock,
  getAllMetalStocks,
  getMetalStockById,
  updateMetalStock,
  deleteMetalStock,
  hardDeleteMetalStock,
  updateStockQuantity,
  getMetalStockStats,
} from "../../controllers/modules/metalStockController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  validateObjectId,
  validateRequiredFields,
  validatePagination,
  validateMetalStockFields,
  validateStringLength,
  validateEnumField,
} from "../../utils/validators/MetalStockValidation.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/", createMetalStock);

router.get("/", getAllMetalStocks);

router.get("/stats", getMetalStockStats);

// router.get("/low-stock", validatePagination, getLowStockItems);

router.get("/:id", validateObjectId("id"), getMetalStockById);

router.put("/:id", updateMetalStock);

router.patch("/:id/quantity", validateObjectId("id"), updateStockQuantity);

router.delete("/:id", validateObjectId("id"), deleteMetalStock);

router.delete("/:id/hard", validateObjectId("id"), hardDeleteMetalStock);

export default router;
