import { createAppError } from "../errorHandler.js";

// Validation middleware for create currency
export const validateCreateCurrency = (req, res, next) => {
  try {
    const {
      currencyCode,
      conversionRate,
      description,
      minRate,
      maxRate,
      symbol
    } = req.body;

    const errors = [];

    // Currency Code validation
    if (!currencyCode) {
      errors.push("Currency code is required");
    } else if (typeof currencyCode !== 'string' || currencyCode.trim().length === 0) {
      errors.push("Currency code must be a non-empty string");
    } else if (currencyCode.trim().length > 10) {
      errors.push("Currency code cannot exceed 10 characters");
    } else if (!/^[A-Z0-9]+$/i.test(currencyCode.trim())) {
      errors.push("Currency code should contain only letters and numbers");
    }

    // Conversion Rate validation
    if (conversionRate === undefined || conversionRate === null) {
      errors.push("Conversion rate is required");
    } else if (isNaN(conversionRate) || parseFloat(conversionRate) <= 0) {
      errors.push("Conversion rate must be a positive number");
    }

    // Description validation
    if (!description) {
      errors.push("Description is required");
    } else if (typeof description !== 'string' || description.trim().length === 0) {
      errors.push("Description must be a non-empty string");
    } else if (description.trim().length > 200) {
      errors.push("Description cannot exceed 200 characters");
    }

    // Min Rate validation
    if (minRate === undefined || minRate === null) {
      errors.push("Minimum rate is required");
    } else if (isNaN(minRate) || parseFloat(minRate) < 0) {
      errors.push("Minimum rate must be a non-negative number");
    }

    // Max Rate validation
    if (maxRate === undefined || maxRate === null) {
      errors.push("Maximum rate is required");
    } else if (isNaN(maxRate) || parseFloat(maxRate) <= 0) {
      errors.push("Maximum rate must be a positive number");
    }

    // Rate range validation
    if (minRate !== undefined && maxRate !== undefined &&
        !isNaN(minRate) && !isNaN(maxRate) &&
        parseFloat(maxRate) <= parseFloat(minRate)) {
      errors.push("Maximum rate must be greater than minimum rate");
    }

    // Conversion rate range validation
    if (conversionRate !== undefined && minRate !== undefined && maxRate !== undefined &&
        !isNaN(conversionRate) && !isNaN(minRate) && !isNaN(maxRate)) {
      const rate = parseFloat(conversionRate);
      const min = parseFloat(minRate);
      const max = parseFloat(maxRate);
      if (rate < min || rate > max) {
        errors.push("Conversion rate must be within minimum and maximum rate range");
      }
    }

    // Symbol validation (optional field)
    if (symbol !== undefined && symbol !== null && symbol !== '') {
      if (typeof symbol !== 'string') {
        errors.push("Symbol must be a string");
      } else if (symbol.trim().length > 10) {
        errors.push("Symbol cannot exceed 10 characters");
      }
    }

    if (errors.length > 0) {
      throw createAppError(
        `Validation failed: ${errors.join(', ')}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Validation middleware for update currency
export const validateUpdateCurrency = (req, res, next) => {
  try {
    const {
      currencyCode,
      conversionRate,
      description,
      minRate,
      maxRate,
      symbol,
      status,
      isActive
    } = req.body;

    const errors = [];

    // Currency Code validation (if provided)
    if (currencyCode !== undefined) {
      if (!currencyCode || typeof currencyCode !== 'string' || currencyCode.trim().length === 0) {
        errors.push("Currency code must be a non-empty string");
      } else if (currencyCode.trim().length > 10) {
        errors.push("Currency code cannot exceed 10 characters");
      } else if (!/^[A-Z0-9]+$/i.test(currencyCode.trim())) {
        errors.push("Currency code should contain only letters and numbers");
      }
    }

    // Conversion Rate validation (if provided)
    if (conversionRate !== undefined) {
      if (isNaN(conversionRate) || parseFloat(conversionRate) <= 0) {
        errors.push("Conversion rate must be a positive number");
      }
    }

    // Description validation (if provided)
    if (description !== undefined) {
      if (!description || typeof description !== 'string' || description.trim().length === 0) {
        errors.push("Description must be a non-empty string");
      } else if (description.trim().length > 200) {
        errors.push("Description cannot exceed 200 characters");
      }
    }

    // Min Rate validation (if provided)
    if (minRate !== undefined) {
      if (isNaN(minRate) || parseFloat(minRate) < 0) {
        errors.push("Minimum rate must be a non-negative number");
      }
    }

    // Max Rate validation (if provided)
    if (maxRate !== undefined) {
      if (isNaN(maxRate) || parseFloat(maxRate) <= 0) {
        errors.push("Maximum rate must be a positive number");
      }
    }

    // Symbol validation (if provided)
    if (symbol !== undefined && symbol !== null && symbol !== '') {
      if (typeof symbol !== 'string') {
        errors.push("Symbol must be a string");
      } else if (symbol.trim().length > 10) {
        errors.push("Symbol cannot exceed 10 characters");
      }
    }

    // Status validation (if provided)
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        errors.push("Status must be either 'active' or 'inactive'");
      }
    }

    // isActive validation (if provided)
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean' && isActive !== 'true' && isActive !== 'false') {
        errors.push("isActive must be a boolean value");
      }
    }

    if (errors.length > 0) {
      throw createAppError(
        `Validation failed: ${errors.join(', ')}`,
        400,
        "VALIDATION_ERROR"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Validation middleware for currency ID parameter
export const validateCurrencyId = (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError(
        "Currency ID is required",
        400,
        "CURRENCY_ID_REQUIRED"
      );
    }

    // Check if ID is a valid MongoDB ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      throw createAppError(
        "Invalid currency ID format",
        400,
        "INVALID_CURRENCY_ID"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Validation middleware for currency code parameter
export const validateCurrencyCode = (req, res, next) => {
  try {
    const { code } = req.params;

    if (!code) {
      throw createAppError(
        "Currency code is required",
        400,
        "CURRENCY_CODE_REQUIRED"
      );
    }

    if (typeof code !== 'string' || code.trim().length === 0) {
      throw createAppError(
        "Currency code must be a non-empty string",
        400,
        "INVALID_CURRENCY_CODE"
      );
    }

    if (code.trim().length > 10) {
      throw createAppError(
        "Currency code cannot exceed 10 characters",
        400,
        "INVALID_CURRENCY_CODE"
      );
    }

    if (!/^[A-Z0-9]+$/i.test(code.trim())) {
      throw createAppError(
        "Currency code should contain only letters and numbers",
        400,
        "INVALID_CURRENCY_CODE"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};