// middleware/validation.js

import { createAppError } from "../errorHandler.js";
import mongoose from "mongoose";

// Validate MongoDB ObjectId
export const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      return next(createAppError(
        `${paramName} is required`,
        400,
        "MISSING_ID"
      ));
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(createAppError(
        `Invalid ${paramName} format`,
        400,
        "INVALID_ID_FORMAT"
      ));
    }

    next();
  };
};

// Validate required fields
export const validateRequiredFields = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!req.body[field] || (typeof req.body[field] === 'string' && req.body[field].trim() === '')) {
        missingFields.push(field);
      }
    });

    if (missingFields.length > 0) {
      return next(createAppError(
        `Missing required fields: ${missingFields.join(', ')}`,
        400,
        "REQUIRED_FIELDS_MISSING"
      ));
    }

    next();
  };
};

// Validate pagination parameters
export const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;

  if (page && (isNaN(page) || parseInt(page) < 1)) {
    return next(createAppError(
      "Page must be a positive number",
      400,
      "INVALID_PAGE"
    ));
  }

  if (limit && (isNaN(limit) || parseInt(limit) < 1 || parseInt(limit) > 100)) {
    return next(createAppError(
      "Limit must be a positive number between 1 and 100",
      400,
      "INVALID_LIMIT"
    ));
  }

  next();
};

// Validate numeric fields
export const validateNumericField = (fieldName, min = null, max = null) => {
  return (req, res, next) => {
    const value = req.body[fieldName];
    
    if (value !== undefined && value !== null) {
      if (isNaN(value)) {
        return next(createAppError(
          `${fieldName} must be a valid number`,
          400,
          "INVALID_NUMBER"
        ));
      }

      const numValue = parseFloat(value);
      
      if (min !== null && numValue < min) {
        return next(createAppError(
          `${fieldName} must be at least ${min}`,
          400,
          "VALUE_TOO_LOW"
        ));
      }

      if (max !== null && numValue > max) {
        return next(createAppError(
          `${fieldName} must be at most ${max}`,
          400,
          "VALUE_TOO_HIGH"
        ));
      }
    }

    next();
  };
};

// Validate metal stock specific fields
export const validateMetalStockFields = (req, res, next) => {
  const { standardPurity, premiumDiscount, stockQuantity, minimumStock, reorderLevel, weight } = req.body;

  // Validate standard purity
  if (standardPurity !== undefined && (isNaN(standardPurity) || standardPurity < 0 || standardPurity > 100)) {
    return next(createAppError(
      "Standard purity must be a number between 0 and 100",
      400,
      "INVALID_PURITY"
    ));
  }

  // Validate premium/discount
  if (premiumDiscount !== undefined && (isNaN(premiumDiscount) || premiumDiscount < -100 || premiumDiscount > 100)) {
    return next(createAppError(
      "Premium/Discount must be a number between -100 and 100",
      400,
      "INVALID_PREMIUM_DISCOUNT"
    ));
  }

  // Validate stock quantities
  const quantityFields = { stockQuantity, minimumStock, reorderLevel, weight };
  
  for (const [fieldName, value] of Object.entries(quantityFields)) {
    if (value !== undefined && (isNaN(value) || parseFloat(value) < 0)) {
      return next(createAppError(
        `${fieldName} must be a non-negative number`,
        400,
        "INVALID_QUANTITY"
      ));
    }
  }

  next();
};

// Validate string length
export const validateStringLength = (fieldName, minLength = 0, maxLength = 255) => {
  return (req, res, next) => {
    const value = req.body[fieldName];
    
    if (value !== undefined && value !== null) {
      const stringValue = value.toString().trim();
      
      if (stringValue.length < minLength) {
        return next(createAppError(
          `${fieldName} must be at least ${minLength} characters long`,
          400,
          "STRING_TOO_SHORT"
        ));
      }

      if (stringValue.length > maxLength) {
        return next(createAppError(
          `${fieldName} cannot exceed ${maxLength} characters`,
          400,
          "STRING_TOO_LONG"
        ));
      }
    }

    next();
  };
};

// Validate enum values
export const validateEnumField = (fieldName, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[fieldName];
    
    if (value !== undefined && value !== null && !allowedValues.includes(value)) {
      return next(createAppError(
        `${fieldName} must be one of: ${allowedValues.join(', ')}`,
        400,
        "INVALID_ENUM_VALUE"
      ));
    }

    next();
  };
};