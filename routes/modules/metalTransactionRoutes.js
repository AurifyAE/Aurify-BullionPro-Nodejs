import express from "express";
import {
  createMetalTransaction,
  getAllMetalTransactions,
  getMetalTransactionById,
  updateMetalTransaction,
  deleteMetalTransaction,
  getMetalTransactionsByParty,
  getTransactionStatistics,
  updateTransactionStatus,
  getProfitLossAnalysis,
  addStockItemToTransaction,
  updateStockItemInTransaction,
  removeStockItemFromTransaction,
  updateSessionTotals,
  calculateSessionTotals,
  getUnfixedTransactions,
  getUnfixedTransactionsWithAccounts,
} from "../../controllers/modules/MetalTransactionController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";
import {
  validateObjectId,
  validatePagination,
  validateDateRange,
  validateMetalTransactionCreate,
  validateMetalTransactionUpdate,
  validateRequiredFields,
  validateEnum,
} from "../../utils/validators/MetalTransactionValidation.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Create a new metal transaction (purchase or sale)
router.post("/", createMetalTransaction);

// Get all metal transactions with optional filtering
router.get("/", validatePagination, validateDateRange, getAllMetalTransactions);

// Get unfixed transactions (both purchase and sale)
router.get(
  "/unfixed",
  validatePagination,
  validateDateRange,
  getUnfixedTransactions
);

// Get unfixed transactions with account details
router.get(
  "/unfixed/with-accounts",
  validatePagination,
  validateDateRange,
  getUnfixedTransactionsWithAccounts
);

// Get transaction statistics
router.get("/statistics", validateDateRange, getTransactionStatistics);

// Get profit/loss analysis
router.get("/analysis/profit-loss", validateDateRange, getProfitLossAnalysis);

// Get metal transactions by party
router.get(
  "/party/:partyId",
  validateObjectId("partyId"),
  validatePagination,
  getMetalTransactionsByParty
);

// Get metal transaction by ID
router.get("/:id", validateObjectId("id"), getMetalTransactionById);

// Update metal transaction
router.put(
  "/:id",
  validateObjectId("id"),
  updateMetalTransaction
);

// Update transaction status only
router.patch(
  "/:id/status",
  validateObjectId("id"),
  validateRequiredFields(["status"]),
  validateEnum("status", ["draft", "confirmed", "completed", "cancelled"]),
  updateTransactionStatus
);

// Delete metal transaction (soft delete)
router.delete("/:id", validateObjectId("id"), deleteMetalTransaction);

// Stock item management
router.post(
  "/:id/stock",
  validateObjectId("id"),
  validateRequiredFields(["stockCode", "metalRate", "purity"]),
  addStockItemToTransaction
);
router.put(
  "/:id/stock/:stockItemId",
  validateObjectId("id"),
  validateObjectId("stockItemId"),
  updateStockItemInTransaction
);
router.delete(
  "/:id/stock/:stockItemId",
  validateObjectId("id"),
  validateObjectId("stockItemId"),
  removeStockItemFromTransaction
);

// Session totals management
router.put("/:id/session-totals", validateObjectId("id"), updateSessionTotals);
router.post(
  "/:id/calculate-session-totals",
  validateObjectId("id"),
  calculateSessionTotals
);



export default router;