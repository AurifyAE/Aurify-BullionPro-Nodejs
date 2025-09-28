import Joi from 'joi';
import { createAppError } from "../errorHandler.js";
import mongoose from 'mongoose';

// Custom validation for MongoDB ObjectId
const objectIdSchema = Joi.string().length(24).hex().required();

// Schema for creating division
const createDivisionSchema = Joi.object({
  code: Joi.string()
    .trim()
    .max(10)
    .pattern(/^[A-Z0-9]+$/i)
    .required()
    .messages({
      'string.empty': 'Division code is required',
      'string.max': 'Division code cannot exceed 10 characters',
      'string.pattern.base': 'Division code should contain only letters and numbers',
      'any.required': 'Division code is required'
    }),
  
  description: Joi.string()
    .trim()
    .max(200)
    .required()
    .messages({
      'string.empty': 'Division description is required',
      'string.max': 'Description cannot exceed 200 characters',
      'any.required': 'Division description is required'
    }),
  
  costCenter: Joi.string()
    .trim()
    .max(50)
    .required()
    .messages({
      'string.empty': 'Cost Center is required',
      'string.max': 'Cost Center cannot exceed 50 characters',
      'any.required': 'Cost Center is required'
    }),
  
  costCenterMaking: Joi.string()
    .trim()
    .max(50)
    .required()
    .messages({
      'string.empty': 'Cost Center (Making) is required',
      'string.max': 'Cost Center (Making) cannot exceed 50 characters',
      'any.required': 'Cost Center (Making) is required'
    }),
  
  autoFixStockCode: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[A-Z0-9]+$/i)
    .required()
    .messages({
      'string.empty': 'Auto Fix Stock Code is required',
      'string.max': 'Auto Fix Stock Code cannot exceed 20 characters',
      'string.pattern.base': 'Auto Fix Stock Code should contain only letters and numbers',
      'any.required': 'Auto Fix Stock Code is required'
    })
}).options({
  stripUnknown: true, // Remove unknown fields for security
  abortEarly: false   // Return all validation errors
});

// Schema for updating division (all fields optional)
const updateDivisionSchema = Joi.object({
  code: Joi.string()
    .trim()
    .max(10)
    .pattern(/^[A-Z0-9]+$/i)
    .messages({
      'string.empty': 'Division code cannot be empty',
      'string.max': 'Division code cannot exceed 10 characters',
      'string.pattern.base': 'Division code should contain only letters and numbers'
    }),
  
  description: Joi.string()
    .trim()
    .max(200)
    .messages({
      'string.empty': 'Division description cannot be empty',
      'string.max': 'Description cannot exceed 200 characters'
    }),
  
  costCenter: Joi.string()
    .trim()
    .max(50)
    .messages({
      'string.empty': 'Cost Center cannot be empty',
      'string.max': 'Cost Center cannot exceed 50 characters'
    }),
  
  costCenterMaking: Joi.string()
    .trim()
    .max(50)
    .messages({
      'string.empty': 'Cost Center (Making) cannot be empty',
      'string.max': 'Cost Center (Making) cannot exceed 50 characters'
    }),
  
  autoFixStockCode: Joi.string()
    .trim()
    .max(20)
    .pattern(/^[A-Z0-9]+$/i)
    .messages({
      'string.empty': 'Auto Fix Stock Code cannot be empty',
      'string.max': 'Auto Fix Stock Code cannot exceed 20 characters',
      'string.pattern.base': 'Auto Fix Stock Code should contain only letters and numbers'
    }),
  
  isActive: Joi.boolean()
    .messages({
      'boolean.base': 'isActive must be a boolean value'
    })
}).min(1).options({
  stripUnknown: true,
  abortEarly: false
}).messages({
  'object.min': 'At least one field is required for update'
});

// Schema for bulk operations
const bulkOperationSchema = Joi.object({
  ids: Joi.array()
    .items(objectIdSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'IDs array cannot be empty',
      'array.max': 'Cannot process more than 100 items at once',
      'any.required': 'IDs array is required'
    })
}).options({
  stripUnknown: true,
  abortEarly: false
});

// Schema for pagination
const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be a positive number'
    }),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    })
}).options({
  stripUnknown: true,
  allowUnknown: true // Allow other query parameters
});

// Schema for search parameters
const searchParamsSchema = Joi.object({
  status: Joi.string()
    .valid('active', 'inactive')
    .messages({
      'any.only': 'Status must be either "active" or "inactive"'
    }),
  
  isActive: Joi.string()
    .valid('true', 'false')
    .messages({
      'any.only': 'isActive must be either "true" or "false"'
    }),
  
  search: Joi.string()
    .max(100)
    .trim()
    .messages({
      'string.max': 'Search term cannot exceed 100 characters'
    }),
  
  sortBy: Joi.string()
    .valid('code', 'description', 'createdAt', 'updatedAt')
    .default('createdAt')
    .messages({
      'any.only': 'sortBy must be one of: code, description, createdAt, updatedAt'
    }),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .messages({
      'any.only': 'sortOrder must be either "asc" or "desc"'
    })
}).options({
  stripUnknown: true,
  allowUnknown: true
});

// FIXED: Generic validation middleware function
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req[property]);
      
      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw createAppError(
          "Validation failed",
          400,
          "VALIDATION_ERROR",
          errorMessages.join(', ')
        );
      }
      
      // FIX: Handle query parameters differently due to getter-only property
      if (property === 'query') {
        // For query parameters, we merge the validated values back
        Object.keys(value).forEach(key => {
          req.query[key] = value[key];
        });
      } else {
        // For body, params, etc., we can replace directly
        req[property] = value;
      }
      
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Alternative approach - Create separate validation for query parameters
const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.query);
      
      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw createAppError(
          "Validation failed",
          400,
          "VALIDATION_ERROR",
          errorMessages.join(', ')
        );
      }
      
      // Store validated query parameters in a custom property
      req.validatedQuery = value;
      
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Validation middleware for creating division
export const validateCreateDivision = validate(createDivisionSchema, 'body');

// Validation middleware for updating division
export const validateUpdateDivision = validate(updateDivisionSchema, 'body');

// Validation middleware for bulk operations
export const validateBulkOperation = validate(bulkOperationSchema, 'body');

// FIXED: Validation middleware for pagination using the alternative approach
export const validatePagination = validateQuery(paginationSchema);

// FIXED: Validation middleware for search parameters using the alternative approach
export const validateSearchParams = validateQuery(searchParamsSchema);

// Additional security validations
export const validateDivisionId = (req, res, next) => {
  try {
    const { error } = objectIdSchema.validate(req.params.id);
    
    if (error) {
      throw createAppError(
        "Invalid division ID format",
        400,
        "INVALID_ID_FORMAT"
      );
    }
    
    next();
  } catch (err) {
    next(err);
  }
};

// Content-Type validation for security
export const validateContentType = (req, res, next) => {
  const contentType = req.get('Content-Type');
  
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (!contentType || !contentType.includes('application/json')) {
      return next(createAppError(
        "Content-Type must be application/json",
        400,
        "INVALID_CONTENT_TYPE"
      ));
    }
  }
  
  next();
};

// File size validation for uploads (if needed)
export const validateFileSize = (maxSize = 5 * 1024 * 1024) => { // 5MB default
  return (req, res, next) => {
    if (req.file && req.file.size > maxSize) {
      return next(createAppError(
        `File size cannot exceed ${maxSize / (1024 * 1024)}MB`,
        400,
        "FILE_TOO_LARGE"
      ));
    }
    next();
  };
};

export const validateObjectId = (req, res, next) => {
  try {
    const id = req.params.id || req.params.divisionId;
    
    if (!id) {
      throw createAppError("ID parameter is required", 400, "ID_REQUIRED");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw createAppError("Invalid ID format", 400, "INVALID_ID_FORMAT");
    }

    next();
  } catch (error) {
    next(error);
  }
};