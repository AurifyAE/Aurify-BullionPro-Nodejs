import express from "express";
import {
  createVoucher,
  updateVoucher,
  getAllVouchers,
  getVoucherById,
  deleteVoucher,
  hardDeleteVoucher,
  getVouchersByModule,
  generateVoucherNumber,
  getVoucherInfoByModule,
} from "../../controllers/modules/VoucherMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Consolidated voucher info endpoint - handles all modules and transaction types
// GET /vouchers/info/:module?transactionType=purchase&entryType=metal-receipt
router.get("/info/:module", getVoucherInfoByModule);

// Voucher number generation - consolidated endpoint
// POST /vouchers/generate/:module?transactionType=purchase
router.post("/generate/:module", generateVoucherNumber);

// Module-specific voucher retrieval with optional voucher type
// GET /vouchers/module/:module?voucherType=PURCHASE&page=1&limit=10
router.get("/module/:module", getVouchersByModule);

// CRUD routes
router.post("/", createVoucher);
router.get("/", getAllVouchers);
router.get("/:id", getVoucherById);
router.put("/:id", updateVoucher);
router.delete("/:id", deleteVoucher);
router.delete("/hard/:id", hardDeleteVoucher);

export default router;