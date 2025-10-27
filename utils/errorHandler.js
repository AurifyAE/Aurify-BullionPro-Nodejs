// utils/errorHandler.js

/**
 * Custom Application Error Class
 * Extends the native Error class with additional properties
 */
export class AppError extends Error {
  constructor(message, statusCode, errorCode = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create Application Error
 * Main function to create operational errors throughout the application
 * 
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (400, 401, 404, 500, etc.)
 * @param {string} errorCode - Machine-readable error code (e.g., "INVALID_TOKEN")
 * @returns {Error} Error object with custom properties
 * 
 * @example
 * throw createAppError("User not found", 404, "USER_NOT_FOUND");
 * throw createAppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
 */
export const createAppError = (message, statusCode, errorCode = null) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  error.isOperational = true;
  return error;
};

/**
 * Global Error Handler Middleware
 * Catches all errors passed via next(error) and formats them for the client
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errorCode = err.errorCode || null;

  // Log error details for debugging
  if (process.env.NODE_ENV === "development") {
    console.error("\n" + "=".repeat(80));
    console.error("🔴 ERROR CAUGHT:");
    console.error("=".repeat(80));
    console.error("Message:", message);
    console.error("Status Code:", statusCode);
    console.error("Error Code:", errorCode);
    console.error("URL:", req.method, req.originalUrl);
    console.error("Stack:", err.stack);
    console.error("=".repeat(80) + "\n");
  }

  // ==========================================
  // Handle Mongoose Errors
  // ==========================================

  // Mongoose bad ObjectId (CastError)
  if (err.name === "CastError") {
    message = `Invalid ${err.path}: ${err.value}`;
    statusCode = 400;
    errorCode = "INVALID_ID";
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue?.[field];
    message = field 
      ? `${field} '${value}' already exists` 
      : "Duplicate field value entered";
    statusCode = 400;
    errorCode = "DUPLICATE_FIELD";
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    message = errors.join(". ");
    statusCode = 400;
    errorCode = "VALIDATION_ERROR";
  }

  // ==========================================
  // Handle JWT Errors
  // ==========================================

  // JWT malformed or invalid signature
  if (err.name === "JsonWebTokenError") {
    message = "Invalid token. Please log in again.";
    statusCode = 401;
    errorCode = "INVALID_TOKEN";
  }

  // JWT expired
  if (err.name === "TokenExpiredError") {
    message = "Your token has expired. Please log in again.";
    statusCode = 401;
    errorCode = "TOKEN_EXPIRED";
  }

  // ==========================================
  // Handle Other Common Errors
  // ==========================================

  // Multer file upload errors
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File size is too large";
      statusCode = 400;
      errorCode = "FILE_TOO_LARGE";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded";
      statusCode = 400;
      errorCode = "TOO_MANY_FILES";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field";
      statusCode = 400;
      errorCode = "UNEXPECTED_FILE";
    } else {
      message = "File upload error";
      statusCode = 400;
      errorCode = "UPLOAD_ERROR";
    }
  }

  // Syntax errors (JSON parsing, etc.)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    message = "Invalid JSON in request body";
    statusCode = 400;
    errorCode = "INVALID_JSON";
  }

  // ==========================================
  // Build Error Response
  // ==========================================

  const errorResponse = {
    success: false,
    message: message,
    code: errorCode,
  };

  // Add additional info in development mode
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
    errorResponse.error = {
      statusCode: statusCode,
      isOperational: err.isOperational || false,
    };
  }

  // ==========================================
  // Log Unexpected Errors
  // ==========================================

  // Log non-operational errors (programming errors)
  if (!err.isOperational) {
    console.error("\n" + "🚨".repeat(40));
    console.error("❌ UNEXPECTED ERROR (Non-Operational):");
    console.error("🚨".repeat(40));
    console.error("This is likely a programming error that needs to be fixed!");
    console.error("Message:", err.message);
    console.error("URL:", req.method, req.originalUrl);
    console.error("Body:", JSON.stringify(req.body, null, 2));
    console.error("Params:", JSON.stringify(req.params, null, 2));
    console.error("Query:", JSON.stringify(req.query, null, 2));
    console.error("Stack:", err.stack);
    console.error("🚨".repeat(40) + "\n");

    // In production, send generic message for unexpected errors
    if (process.env.NODE_ENV === "production") {
      errorResponse.message = "Something went wrong! Please try again later.";
      errorResponse.code = "INTERNAL_ERROR";
    }
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async Handler Wrapper
 * Wraps async route handlers to automatically catch errors
 * Eliminates the need for try-catch blocks in every controller
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function that catches errors
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not Found Handler
 * Catches all requests to undefined routes
 * Should be placed after all route definitions
 * 
 * @example
 * app.use(notFoundHandler);
 */
export const notFoundHandler = (req, res, next) => {
  const error = createAppError(
    `Route ${req.originalUrl} not found`,
    404,
    "ROUTE_NOT_FOUND"
  );
  next(error);
};

// ==========================================
// Common Error Creation Helpers
// ==========================================

/**
 * Create a 400 Bad Request error
 */
export const badRequest = (message, code = "BAD_REQUEST") => {
  return createAppError(message, 400, code);
};

/**
 * Create a 401 Unauthorized error
 */
export const unauthorized = (message = "Unauthorized", code = "UNAUTHORIZED") => {
  return createAppError(message, 401, code);
};

/**
 * Create a 403 Forbidden error
 */
export const forbidden = (message = "Forbidden", code = "FORBIDDEN") => {
  return createAppError(message, 403, code);
};

/**
 * Create a 404 Not Found error
 */
export const notFound = (message, code = "NOT_FOUND") => {
  return createAppError(message, 404, code);
};

/**
 * Create a 409 Conflict error
 */
export const conflict = (message, code = "CONFLICT") => {
  return createAppError(message, 409, code);
};

/**
 * Create a 500 Internal Server error
 */
export const internalError = (message = "Internal Server Error", code = "INTERNAL_ERROR") => {
  return createAppError(message, 500, code);
};

// ==========================================
// Usage Examples:
// ==========================================

/*
// Basic usage:
throw createAppError("User not found", 404, "USER_NOT_FOUND");

// Using helpers:
throw notFound("User not found", "USER_NOT_FOUND");
throw unauthorized("Invalid credentials", "INVALID_CREDENTIALS");
throw forbidden("Access denied", "ACCESS_DENIED");

// With async handler:
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw notFound("User not found", "USER_NOT_FOUND");
  }
  res.json(user);
});

// In Express app:
import { errorHandler, notFoundHandler } from './utils/errorHandler.js';

// ... all your routes ...

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);
*/