import express from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { getAllInventory, createInventory, updateInventory, getInventoryById, getAllLogs, getInventoryLogById, deleteInventoryLogById, updateInventoryLog, updateInventoryBatchWiseOpeningStock } from '../../controllers/modules/inventoryController.js';

const router = express.Router();
router.use(authenticateToken);

router.post("/", createInventory);
router.get("/logs", getAllLogs);
router.get("/", getAllInventory);
router.put("/", updateInventory);
router.put("/opening-stock/:voucherId", updateInventoryBatchWiseOpeningStock);
router.get("/:id", getInventoryById);
router.get("/log/:id", getInventoryLogById);
router.put("/log/:id", updateInventoryLog);
router.delete("/log/:id", deleteInventoryLogById);

export default router;