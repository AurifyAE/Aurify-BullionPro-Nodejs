import express from "express";
import {
  login,
  refreshToken,
  logout,
  viewPassword,
  verifyToken,
} from "../../../controllers/core/authController.js";

import { authenticateToken } from "../../../middleware/authMiddleware.js";
import { validateLoginInput } from "../../../middleware/validationMiddleware.js";

const router = express.Router();

router.post("/login", validateLoginInput, login);
router.post("/refresh", refreshToken);
router.post("/logout", authenticateToken, logout);
router.get("/view-password", authenticateToken, viewPassword);
router.post("/verify-token", authenticateToken, verifyToken);

export default router;
