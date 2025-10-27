import { verifyToken } from "../services/core/authService.js";
import { createAppError } from "../utils/errorHandler.js";
import Admin from "../models/core/adminModel.js";


export const authenticateToken = async (req, res, next) => {
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
    // Optional: Verify admin still exists and is active
    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive || admin.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Admin not found or inactive",
        error: "ADMIN_INACTIVE"
      });
    }

    // Attach admin data to request
    req.admin = {
      id: decoded.id,
      email: decoded.email,
      type: decoded.type,
      permissions: decoded.permissions,
      name: decoded.name
    };

    next();

  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      error: error.message
    });
  }
};

/**
 * Optional Authentication Middleware
 * Similar to authenticateToken but doesn't throw error if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (token) {
      try {
        const decoded = verifyToken(token);
        
        // Verify admin still exists
        const admin = await Admin.findById(decoded.id);
        if (admin && admin.isActive && admin.status === "active") {
          req.admin = {
            id: decoded.id,
            email: decoded.email,
            type: decoded.type,
            permissions: decoded.permissions,
            name: decoded.name
          };
        }
      } catch (tokenError) {
        // Ignore token errors in optional auth
        console.warn("Optional auth token error:", tokenError.message);
      }
    }

    next();

  } catch (error) {
    next(error);
  }
};

/**
 * Permission-based Authorization Middleware
 * Checks if admin has required permission(s)
 * @param {string|Array} requiredPermissions - Single permission or array of permissions
 * @param {boolean} requireAll - If true, admin must have ALL permissions. If false, ANY permission is sufficient
 * @returns {Function} - Express middleware function
 */
export const requirePermission = (requiredPermissions, requireAll = false) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        throw createAppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      const adminPermissions = req.admin.permissions || [];
      const permissions = Array.isArray(requiredPermissions) 
        ? requiredPermissions 
        : [requiredPermissions];

      // Check permissions
      const hasPermission = requireAll
        ? permissions.every(permission => adminPermissions.includes(permission))
        : permissions.some(permission => adminPermissions.includes(permission));

      if (!hasPermission) {
        throw createAppError(
          "Insufficient permissions", 
          403, 
          "INSUFFICIENT_PERMISSIONS",
          { required: permissions, current: adminPermissions }
        );
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

/**
 * Role-based Authorization Middleware
 * Checks if admin has required role(s)
 * @param {string|Array} requiredRoles - Single role or array of roles
 * @returns {Function} - Express middleware function
 */
export const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        throw createAppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      const adminRole = req.admin.type;
      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      if (!roles.includes(adminRole)) {
        throw createAppError(
          "Insufficient role permissions", 
          403, 
          "INSUFFICIENT_ROLE",
          { required: roles, current: adminRole }
        );
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

/**
 * Super Admin Only Middleware
 * Restricts access to super_admin role only
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.admin) {
      throw createAppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    if (req.admin.type !== "super_admin") {
      throw createAppError(
        "Super admin access required", 
        403, 
        "SUPER_ADMIN_REQUIRED"
      );
    }

    next();

  } catch (error) {
    next(error);
  }
};

/**
 * Rate Limiting Middleware for Auth Routes
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxAttempts - Maximum attempts allowed
 * @returns {Function} - Express middleware function
 */
export const authRateLimit = (windowMs = 15 * 60 * 1000, maxAttempts = 2) => {
  const attempts = new Map();

  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Clean old entries
    for (const [key, data] of attempts.entries()) {
      if (now - data.firstAttempt > windowMs) {
        attempts.delete(key);
      }
    }

    // Check current client attempts
    const clientAttempts = attempts.get(clientId);
    
    if (!clientAttempts) {
      attempts.set(clientId, { firstAttempt: now, count: 1 });
      return next();
    }

    if (now - clientAttempts.firstAttempt > windowMs) {
      // Reset window
      attempts.set(clientId, { firstAttempt: now, count: 1 });
      return next();
    }

    if (clientAttempts.count >= maxAttempts) {
      const resetTime = new Date(clientAttempts.firstAttempt + windowMs);
      throw createAppError(
        `Too many login attempts. Try again after ${resetTime.toLocaleTimeString()}`, 
        429, 
        "RATE_LIMIT_EXCEEDED"
      );
    }

    clientAttempts.count++;
    next();
  };
};