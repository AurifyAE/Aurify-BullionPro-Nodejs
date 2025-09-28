import { createAppError } from "../utils/errorHandler.js";

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with isValid and errors
 */
const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    errors.push("Password is required");
    return { isValid: false, errors };
  }
  
  if (password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }
  
  if (password.length > 128) {
    errors.push("Password cannot exceed 128 characters");
  }
  
  // Optional: Add more password complexity rules
  // if (!/(?=.*[a-z])/.test(password)) {
  //   errors.push("Password must contain at least one lowercase letter");
  // }
  
  // if (!/(?=.*[A-Z])/.test(password)) {
  //   errors.push("Password must contain at least one uppercase letter");
  // }
  
  // if (!/(?=.*\d)/.test(password)) {
  //   errors.push("Password must contain at least one number");
  // }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Login input validation middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateLoginInput = (req, res, next) => {
  try {
    const { email, password } = req.body;
    const errors = [];

    // Validate email
    if (!email) {
      errors.push("Email is required");
    } else if (typeof email !== "string") {
      errors.push("Email must be a string");
    } else if (!isValidEmail(email.trim())) {
      errors.push("Please provide a valid email address");
    }

    // Validate password
    if (!password) {
      errors.push("Password is required");
    } else if (typeof password !== "string") {
      errors.push("Password must be a string");
    } else if (password.length < 1) {
      errors.push("Password cannot be empty");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    // Sanitize inputs
    req.body.email = email.trim().toLowerCase();
    req.body.password = password;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Password change validation middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validatePasswordChange = (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const errors = [];

    // Validate current password
    if (!currentPassword) {
      errors.push("Current password is required");
    } else if (typeof currentPassword !== "string") {
      errors.push("Current password must be a string");
    }

    // Validate new password
    if (!newPassword) {
      errors.push("New password is required");
    } else if (typeof newPassword !== "string") {
      errors.push("New password must be a string");
    } else {
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.errors);
      }
    }

    // Validate confirm password
    if (!confirmPassword) {
      errors.push("Password confirmation is required");
    } else if (typeof confirmPassword !== "string") {
      errors.push("Password confirmation must be a string");
    } else if (newPassword && newPassword !== confirmPassword) {
      errors.push("New password and confirmation password do not match");
    }

    // Check if new password is different from current password
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errors.push("New password must be different from current password");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Registration input validation middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateRegistrationInput = (req, res, next) => {
  try {
    const { email, password, confirmPassword, name } = req.body;
    const errors = [];

    // Validate name
    if (!name) {
      errors.push("Name is required");
    } else if (typeof name !== "string") {
      errors.push("Name must be a string");
    } else if (name.trim().length < 2) {
      errors.push("Name must be at least 2 characters long");
    } else if (name.trim().length > 50) {
      errors.push("Name cannot exceed 50 characters");
    }

    // Validate email
    if (!email) {
      errors.push("Email is required");
    } else if (typeof email !== "string") {
      errors.push("Email must be a string");
    } else if (!isValidEmail(email.trim())) {
      errors.push("Please provide a valid email address");
    }

    // Validate password
    if (!password) {
      errors.push("Password is required");
    } else if (typeof password !== "string") {
      errors.push("Password must be a string");
    } else {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.errors);
      }
    }

    // Validate confirm password
    if (!confirmPassword) {
      errors.push("Password confirmation is required");
    } else if (typeof confirmPassword !== "string") {
      errors.push("Password confirmation must be a string");
    } else if (password && password !== confirmPassword) {
      errors.push("Password and confirmation password do not match");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    // Sanitize inputs
    req.body.email = email.trim().toLowerCase();
    req.body.name = name.trim();
    req.body.password = password;
    req.body.confirmPassword = confirmPassword;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Email validation middleware for password reset
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateEmailInput = (req, res, next) => {
  try {
    const { email } = req.body;
    const errors = [];

    // Validate email
    if (!email) {
      errors.push("Email is required");
    } else if (typeof email !== "string") {
      errors.push("Email must be a string");
    } else if (!isValidEmail(email.trim())) {
      errors.push("Please provide a valid email address");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    // Sanitize input
    req.body.email = email.trim().toLowerCase();

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Password reset validation middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validatePasswordReset = (req, res, next) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    const errors = [];

    // Validate token
    if (!token) {
      errors.push("Reset token is required");
    } else if (typeof token !== "string") {
      errors.push("Reset token must be a string");
    } else if (token.trim().length < 1) {
      errors.push("Reset token cannot be empty");
    }

    // Validate new password
    if (!newPassword) {
      errors.push("New password is required");
    } else if (typeof newPassword !== "string") {
      errors.push("New password must be a string");
    } else {
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        errors.push(...passwordValidation.errors);
      }
    }

    // Validate confirm password
    if (!confirmPassword) {
      errors.push("Password confirmation is required");
    } else if (typeof confirmPassword !== "string") {
      errors.push("Password confirmation must be a string");
    } else if (newPassword && newPassword !== confirmPassword) {
      errors.push("New password and confirmation password do not match");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    // Sanitize token
    req.body.token = token.trim();

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Profile update validation middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const validateProfileUpdate = (req, res, next) => {
  try {
    const { name, email } = req.body;
    const errors = [];

    // Validate name if provided
    if (name !== undefined) {
      if (!name) {
        errors.push("Name cannot be empty");
      } else if (typeof name !== "string") {
        errors.push("Name must be a string");
      } else if (name.trim().length < 2) {
        errors.push("Name must be at least 2 characters long");
      } else if (name.trim().length > 50) {
        errors.push("Name cannot exceed 50 characters");
      }
    }

    // Validate email if provided
    if (email !== undefined) {
      if (!email) {
        errors.push("Email cannot be empty");
      } else if (typeof email !== "string") {
        errors.push("Email must be a string");
      } else if (!isValidEmail(email.trim())) {
        errors.push("Please provide a valid email address");
      }
    }

    // Check if at least one field is provided
    if (name === undefined && email === undefined) {
      errors.push("At least one field (name or email) must be provided");
    }

    if (errors.length > 0) {
      throw createAppError("Validation failed", 400, "VALIDATION_ERROR", { errors });
    }

    // Sanitize inputs
    if (name !== undefined) {
      req.body.name = name.trim();
    }
    if (email !== undefined) {
      req.body.email = email.trim().toLowerCase();
    }

    next();
  } catch (error) {
    next(error);
  }
};