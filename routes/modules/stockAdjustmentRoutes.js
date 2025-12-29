import express from "express";
import { Router } from "express";
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { createStockAdjustment, getAllStockAdjustments, getStockAdjustmentById, updateStockAdjustment, deleteStockAdjustment, createStockAdjustmentBatch, getStockAdjustmentByVoucher } from '../../controllers/modules/stockAdjustmentController.js';

const router = Router();
router.use(authenticateToken);

router.post("/", createStockAdjustment);
router.post("/batch", createStockAdjustmentBatch);
router.get("/voucher/:voucherNo", getStockAdjustmentByVoucher);
router.get("/", getAllStockAdjustments);
router.get("/:id", getStockAdjustmentById);
router.put("/:id", updateStockAdjustment);
router.delete("/:id", deleteStockAdjustment);


export default router;