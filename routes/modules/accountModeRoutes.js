import express from "express";
import AccountModeController from "../../controllers/modules/accountModeController.js";
import { authenticateToken } from "../../middleware/authMiddleware.js";

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);

// CREATE - Add new account mode
router.post("/", AccountModeController.createAccountMode);

// READ - Get all account modes with pagination and search
router.get("/", AccountModeController.getAllAccountModes);

// READ - Get account mode by ID
router.get("/:id", AccountModeController.getAccountModeById);

// UPDATE - Update account mode
router.put("/:id", AccountModeController.updateAccountMode);

// DELETE - Delete account mode
router.delete("/:id", AccountModeController.deleteAccountMode);

export default router;