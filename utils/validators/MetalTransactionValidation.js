import mongoose from "mongoose";
import { createAppError } from "../errorHandler.js";

// Validate MongoDB ObjectId
export const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      throw createAppError(`${paramName} is required`, 400, "MISSING_PARAMETER");
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError(`Invalid ${paramName} format`, 400, "INVALID_OBJECT_ID");
    }
    
    next();
  };
};

// Validate required fields in request body
export const validateRequiredFields = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!req.body[field] || (typeof req.body[field] === 'string' && req.body[field].trim() === '')) {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      throw createAppError(
        `Required fields missing: ${missingFields.join(', ')}`,
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }
    
    next();
  };
};

// Validate numeric values
export const validateNumericFields = (numericFields) => {
  return (req, res, next) => {
    const invalidFields = [];
    
    numericFields.forEach(({ field, min, max, required = false }) => {
      const value = req.body[field];
      
      if (required && (value === undefined || value === null)) {
        invalidFields.push(`${field} is required`);
        return;
      }
      
      if (value !== undefined && value !== null) {
        const numValue = Number(value);
        
        if (isNaN(numValue)) {
          invalidFields.push(`${field} must be a valid number`);
        } else {
          if (min !== undefined && numValue < min) {
            invalidFields.push(`${field} must be at least ${min}`);
          }
          if (max !== undefined && numValue > max) {
            invalidFields.push(`${field} cannot exceed ${max}`);
          }
        }
      }
    });
    
    if (invalidFields.length > 0) {
      throw createAppError(
        `Validation errors: ${invalidFields.join(', ')}`,
        400,
        "VALIDATION_ERROR"
      );
    }
    
    next();
  };
};

// Validate pagination parameters
export const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  
  if (page && (!Number.isInteger(Number(page)) || Number(page) < 1)) {
    throw createAppError("Page must be a positive integer", 400, "INVALID_PAGE");
  }
  
  if (limit && (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    throw createAppError("Limit must be between 1 and 100", 400, "INVALID_LIMIT");
  }
  
  next();
};

// Validate date range
export const validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && !Date.parse(startDate)) {
    throw createAppError("Invalid start date format", 400, "INVALID_START_DATE");
  }
  
  if (endDate && !Date.parse(endDate)) {
    throw createAppError("Invalid end date format", 400, "INVALID_END_DATE");
  }
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      throw createAppError("Start date cannot be after end date", 400, "INVALID_DATE_RANGE");
    }
  }
  
  next();
};

// Validate enum values
export const validateEnum = (field, allowedValues) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value && !allowedValues.includes(value)) {
      throw createAppError(
        `Invalid ${field}. Must be one of: ${allowedValues.join(', ')}`,
        400,
        "INVALID_ENUM_VALUE"
      );
    }
    
    next();
  };
};

// Validate transaction type in URL params
export const validateTransactionType = (req, res, next) => {
  const { transactionType } = req.params;
  
  if (transactionType && !['purchase', 'sale'].includes(transactionType)) {
    throw createAppError(
      "Invalid transaction type. Must be 'purchase' or 'sale'",
      400,
      "INVALID_TRANSACTION_TYPE"
    );
  }
  
  next();
};

// Metal Transaction specific validation for CREATE
export const validateMetalTransactionCreate = [
  validateRequiredFields([
    'transactionType',
    'partyCode',
    'partyCurrency',
    'metalRate',
    'stockCode',
    'purity',
    'purityWeight',
    'weightInOz'
  ]),
  validateEnum('transactionType', ['purchase', 'sale']),
  validateNumericFields([
    { field: 'pieces', min: 0 },
    { field: 'grossWeight', min: 0 },
    { field: 'purity', min: 0, max: 100, required: true },
    { field: 'purityWeight', min: 0, required: true },
    { field: 'weightInOz', min: 0, required: true },
    { field: 'crDays', min: 0 },
    { field: 'creditDays', min: 0 },
    { field: 'metalRateRequirements.amount', min: 0 },
    { field: 'makingCharges.amount', min: 0 },
    { field: 'premium.amount' }, // Can be negative for discounts
  ]),
  validateEnum('status', ['draft', 'confirmed', 'completed', 'cancelled'])
];

// Metal Transaction specific validation for UPDATE
export const validateMetalTransactionUpdate = [
  validateNumericFields([
    { field: 'grossWeight', min: 0 },
    { field: 'purity', min: 0, max: 100 },
    { field: 'purityWeight', min: 0 },
    { field: 'weightInOz', min: 0 },
    { field: 'crDays', min: 0 },
    { field: 'creditDays', min: 0 },
    { field: 'metalRateRequirements.amount', min: 0 },
    { field: 'makingCharges.amount', min: 0 },
    { field: 'premium.amount' }, // Can be negative for discounts
    { field: 'totalAmountSession.totalAmountAED', min: 0 },
    { field: 'totalAmountSession.netAmountAED', min: 0 },
    { field: 'totalAmountSession.vatAmount', min: 0 },
    { field: 'totalAmountSession.vatPercentage', min: 0, max: 100 }
  ]),
  validateEnum('status', ['draft', 'confirmed', 'completed', 'cancelled']),
  validateEnum('transactionType', ['purchase', 'sale'])
];

// Backward compatibility - keeping old validation names
export const validateMetalPurchaseCreate = validateMetalTransactionCreate;
export const validateMetalPurchaseUpdate = validateMetalTransactionUpdate;