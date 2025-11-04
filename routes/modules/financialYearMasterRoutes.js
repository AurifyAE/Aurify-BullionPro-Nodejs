import express from "express";
import FinancialYearController from "../../controllers/modules/financialYearMasterController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE
router.post("/", FinancialYearController.createFinancialYear);

// READ
router.get("/", FinancialYearController.getAllFinancialYears);
router.get("/current", FinancialYearController.getCurrentFinancialYear);
router.get("/:id", FinancialYearController.getFinancialYearById);

// UPDATE
router.put("/:id", FinancialYearController.updateFinancialYear);

// DELETE
router.delete("/:id", FinancialYearController.deleteFinancialYear);
router.patch("/:id/deactivate", FinancialYearController.softDeleteFinancialYear);

export default router;