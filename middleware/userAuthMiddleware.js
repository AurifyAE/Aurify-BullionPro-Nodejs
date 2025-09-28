
import { verifyToken } from "../services/core/userAuthService.js";
import { createAppError } from "../utils/errorHandler.js";
import Account from "../models/modules/AccountType.js"; // Adjust path as needed

export const authenticateUserToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token is required",
        error: "MISSING_TOKEN"
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Verify user still exists and is active
    const user = await Account.findById(decoded.id);
    if (!user || !user.isActive || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
        error: "USER_INACTIVE"
      });
    }

    // Attach user data to request
    req.user = {
      id: decoded.id,
      accountCode: decoded.accountCode,
      type: decoded.type,
      name: user.customerName,
      permissions: decoded.permissions || []
    };

    next();
  } catch (error) {
    console.error("User authentication error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      error: error.message
    });
  }
};