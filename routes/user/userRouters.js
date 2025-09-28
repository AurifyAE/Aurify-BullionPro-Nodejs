import express from "express";
import {
  login,
  refreshToken,
  logout,
  getProfile,
  changePassword,
  getUnfixedTransactionsWithAccounts
} from "../../controllers/user/userController.js";
import { authenticateUserToken } from "../../middleware/userAuthMiddleware.js";

const router = express.Router();

// Public routes
router.post("/login", login);
router.post("/refresh-token", refreshToken);

// Protected routes (require authentication)
router.post("/logout", authenticateUserToken, logout);
router.get("/profile", authenticateUserToken, getProfile);
router.put("/change-password", authenticateUserToken, changePassword);
router.get(
  "/unfixed/with-accounts",
  authenticateUserToken,
  getUnfixedTransactionsWithAccounts
);
export default router;
