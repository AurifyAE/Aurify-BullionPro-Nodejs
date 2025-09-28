import express from "express";
import {
  createTransaction,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  cancelTransaction,
  permanentDeleteTransaction,
  restoreTransaction,
  getTransactionsByParty,
  getTransactionsByMetal,
  getPartyMetalSummary,
} from "../../controllers/modules/TransactionFixingController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET routes
router.get("/transactions", getAllTransactions);
router.get("/transactions/:id", getTransactionById);
router.get("/party/:partyId/transactions", getTransactionsByParty);
router.get("/metal/:metalType/transactions", getTransactionsByMetal);
router.get("/party/:partyId/metal/:metalType/summary", getPartyMetalSummary);

// POST routes
router.post("/transactions", createTransaction);

// PUT routes
router.put("/transactions/:id", updateTransaction);
router.put("/transactions/:id/restore", restoreTransaction);
router.put("/transactions/:id/cancel", cancelTransaction);

// DELETE routes
router.delete("/transactions/:id", deleteTransaction);
router.delete("/transactions/:id/permanent", permanentDeleteTransaction);

export default router;