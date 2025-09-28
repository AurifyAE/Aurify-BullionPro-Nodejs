import Admin from "../../models/core/adminModel.js";
import jwt from "jsonwebtoken";
import { createAppError } from "../../utils/errorHandler.js";

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d";
const JWT_REFRESH_EXPIRES_IN = "30d";


export const generateTokens = (payload) => {
  const accessToken = jwt.sign({ ...payload, type: "access" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "bullion-system",
    audience: "bullion-admin",
  });

  const refreshToken = jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: "bullion-system",
    audience: "bullion-admin",
  });

  return { accessToken, refreshToken };
};


export const verifyToken = (token) => {
  let type = "access"; // default to access if decoding fails

  try {
    // Decode the token first (without verifying) to read the `type`
    const decodedPayload = jwt.decode(token);

    if (decodedPayload && decodedPayload.type) {
      type = decodedPayload.type;
    }

    // Now fully verify the token
    return jwt.verify(token, JWT_SECRET, {
      issuer: "bullion-system",
      audience: "bullion-admin",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw createAppError(
        type === "refresh"
          ? "Refresh token has expired. Please log in again."
          : "Access token has expired",
        401,
        type === "refresh" ? "REFRESH_TOKEN_EXPIRED" : "ACCESS_TOKEN_EXPIRED"
      );
    }

    if (error.name === "JsonWebTokenError") {
      throw createAppError(
        type === "refresh" ? "Invalid refresh token" : "Invalid access token",
        401,
        type === "refresh" ? "INVALID_REFRESH_TOKEN" : "INVALID_ACCESS_TOKEN"
      );
    }

    throw createAppError("Token verification failed", 401, "TOKEN_ERROR");
  }
};

export const loginAdmin = async (email, password, ipAddress = null) => {
  try {
    // Input validation
    if (!email || !password) {
      throw createAppError(
        "Email and password are required",
        400,
        "MISSING_CREDENTIALS"
      );
    }

    // Find admin by email and include password for comparison
    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
      isActive: true,
    }).select("+password +loginAttempts +lockUntil");

    if (!admin) {
      throw createAppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS"
      );
    }

    // Check if account is locked
    if (admin.isLocked) {
      const lockTimeRemaining = Math.ceil(
        (admin.lockUntil - Date.now()) / (1000 * 60)
      );
      throw createAppError(
        `Account is locked. Try again after ${lockTimeRemaining} minutes`,
        423,
        "ACCOUNT_LOCKED"
      );
    }

    // Check account status
    if (admin.status !== "active") {
      throw createAppError("Account is not active", 403, "ACCOUNT_INACTIVE");
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      // Increment login attempts on failed login
      await admin.incLoginAttempts();
      throw createAppError(
        "Invalid email or password",
        401,
        "INVALID_CREDENTIALS"
      );
    }

    // Reset login attempts on successful login
    if (admin.loginAttempts > 0) {
      await admin.resetLoginAttempts();
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate JWT tokens
    const tokenPayload = {
      id: admin._id,
      email: admin.email,
      type: admin.type,
      permissions: admin.permissions,
      name: admin.name,
    };

    const { accessToken, refreshToken } = generateTokens(tokenPayload);

    // Prepare response data (password excluded via toJSON method)
    const adminData = admin.toJSON();

    return {
      success: true,
      message: "Login successful",
      data: {
        admin: adminData,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: JWT_EXPIRES_IN,
        },
        loginInfo: {
          lastLogin: admin.lastLogin,
          ipAddress,
        },
      },
    };
  } catch (error) {
    // Re-throw AppError instances
    if (error.isOperational) {
      throw error;
    }

    // Handle unexpected errors
    console.error("Login service error:", error);
    throw createAppError("Login failed", 500, "LOGIN_ERROR");
  }
};

export const refreshAccessToken = async (refreshToken) => {
  try {
    if (!refreshToken) {
      throw createAppError(
        "Refresh token is required",
        400,
        "MISSING_REFRESH_TOKEN"
      );
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== "refresh") {
      throw createAppError("Invalid token type", 401, "INVALID_TOKEN_TYPE");
    }

    // Find admin to ensure they still exist and are active
    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive || admin.status !== "active") {
      throw createAppError(
        "Admin not found or inactive",
        401,
        "ADMIN_INACTIVE"
      );
    }

    // Generate new access token
    const tokenPayload = {
      id: admin._id,
      email: admin.email,
      type: admin.type,
      permissions: admin.permissions,
      name: admin.name,
    };

    const { accessToken } = generateTokens(tokenPayload);

    return {
      success: true,
      message: "Token refreshed successfully",
      data: {
        accessToken,
        expiresIn: JWT_EXPIRES_IN,
      },
    };
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }

    console.error("Token refresh error:", error);
    throw createAppError("Token refresh failed", 500, "TOKEN_REFRESH_ERROR");
  }
};

export const logoutAdmin = async (adminId) => {
  try {
    // You can implement token blacklisting here if needed
    // For now, just return success as JWT is stateless

    return {
      success: true,
      message: "Logged out successfully",
    };
  } catch (error) {
    console.error("Logout service error:", error);
    throw createAppError("Logout failed", 500, "LOGOUT_ERROR");
  }
};

/**
 * Get admin profile by ID
 * @param {string} adminId - Admin ID
 * @returns {Object} - Admin profile data
 */
export const getAdminProfile = async (adminId) => {
  try {
    const admin = await Admin.findById(adminId);

    if (!admin || !admin.isActive) {
      throw createAppError("Admin not found", 404, "ADMIN_NOT_FOUND");
    }

    return {
      success: true,
      data: admin.toJSON(),
    };
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }

    console.error("Get profile error:", error);
    throw createAppError("Failed to get profile", 500, "PROFILE_ERROR");
  }
};
