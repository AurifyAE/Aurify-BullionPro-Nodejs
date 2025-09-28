import { createAppError } from "../../utils/errorHandler.js";

export const validatePermissions = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      // Check if admin data exists (from authentication middleware)
      if (!req.admin) {
        throw createAppError(
          "Authentication required",
          401,
          "AUTHENTICATION_REQUIRED"
        );
      }

      const { permissions, type } = req.admin;

      // Super admin has all permissions
      if (type === 'super_admin') {
        return next();
      }

      // Check if admin has required permissions
      if (!permissions || !Array.isArray(permissions)) {
        throw createAppError(
          "Access denied - No permissions assigned",
          403,
          "NO_PERMISSIONS"
        );
      }

      // Check if admin has at least one of the required permissions
      const hasPermission = requiredPermissions.some(permission => 
        permissions.includes(permission) || permissions.includes('admin')
      );

      if (!hasPermission) {
        throw createAppError(
          "Access denied - Insufficient permissions",
          403,
          "INSUFFICIENT_PERMISSIONS"
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};