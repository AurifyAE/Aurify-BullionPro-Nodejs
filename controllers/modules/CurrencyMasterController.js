import { createAppError } from "../../utils/errorHandler.js";
import CurrencyMasterService from "../../services/modules/CurrencyMasterService.js";

// Create new currency
export const createCurrency = async (req, res, next) => {
  try {
    const {
      currencyCode,
      conversionRate,
      description,
      minRate,
      maxRate,
      symbol
    } = req.body;

    // Validation
    if (
      !currencyCode ||
      !conversionRate ||
      !description ||
      minRate === undefined ||
      maxRate === undefined
    ) {
      throw createAppError(
        "All fields are required: currencyCode, conversionRate, description, minRate, maxRate",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    // Validate numeric fields
    if (isNaN(conversionRate) || conversionRate <= 0) {
      throw createAppError(
        "Conversion rate must be a positive number",
        400,
        "INVALID_CONVERSION_RATE"
      );
    }

    if (isNaN(minRate) || minRate < 0) {
      throw createAppError(
        "Minimum rate must be a non-negative number",
        400,
        "INVALID_MIN_RATE"
      );
    }

    if (isNaN(maxRate) || maxRate <= 0) {
      throw createAppError(
        "Maximum rate must be a positive number",
        400,
        "INVALID_MAX_RATE"
      );
    }

    const currencyData = {
      currencyCode: currencyCode.trim(),
      conversionRate: parseFloat(conversionRate),
      description: description.trim(),
      minRate: parseFloat(minRate),
      maxRate: parseFloat(maxRate),
      symbol: symbol ? symbol.trim() : null,
    };

    const currency = await CurrencyMasterService.createCurrency(
      currencyData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Currency created successfully",
      data: currency,
    });
  } catch (error) {
    next(error);
  }
};

// Get all currencies
export const getAllCurrencies = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      isActive,
      currencyCode,
      description
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (currencyCode) filters.currencyCode = currencyCode;
    if (description) filters.description = description;

    const result = await CurrencyMasterService.getAllCurrencies(
      filters,
      parseInt(page),
      parseInt(limit),
      sortBy,
      sortOrder
    );

    res.status(200).json({
      success: true,
      message: "Currencies retrieved successfully",
      data: result.currencies,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get currency by ID
export const getCurrencyById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError(
        "Currency ID is required",
        400,
        "CURRENCY_ID_REQUIRED"
      );
    }

    const currency = await CurrencyMasterService.getCurrencyById(id);

    res.status(200).json({
      success: true,
      message: "Currency retrieved successfully",
      data: currency,
    });
  } catch (error) {
    next(error);
  }
};

// Update currency
export const updateCurrency = async (req, res, next) => {
  try {
    const { id } = req.params;
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

    if (!id) {
      throw createAppError(
        "Currency ID is required",
        400,
        "CURRENCY_ID_REQUIRED"
      );
    }

    // Build update data object
    const updateData = {};
    
    if (currencyCode !== undefined) {
      if (!currencyCode.trim()) {
        throw createAppError(
          "Currency code cannot be empty",
          400,
          "INVALID_CURRENCY_CODE"
        );
      }
      updateData.currencyCode = currencyCode.trim();
    }

    if (conversionRate !== undefined) {
      if (isNaN(conversionRate) || conversionRate <= 0) {
        throw createAppError(
          "Conversion rate must be a positive number",
          400,
          "INVALID_CONVERSION_RATE"
        );
      }
      updateData.conversionRate = parseFloat(conversionRate);
    }

    if (description !== undefined) {
      if (!description.trim()) {
        throw createAppError(
          "Description cannot be empty",
          400,
          "INVALID_DESCRIPTION"
        );
      }
      updateData.description = description.trim();
    }

    if (minRate !== undefined) {
      if (isNaN(minRate) || minRate < 0) {
        throw createAppError(
          "Minimum rate must be a non-negative number",
          400,
          "INVALID_MIN_RATE"
        );
      }
      updateData.minRate = parseFloat(minRate);
    }

    if (maxRate !== undefined) {
      if (isNaN(maxRate) || maxRate <= 0) {
        throw createAppError(
          "Maximum rate must be a positive number",
          400,
          "INVALID_MAX_RATE"
        );
      }
      updateData.maxRate = parseFloat(maxRate);
    }

    if (symbol !== undefined) {
      updateData.symbol = symbol ? symbol.trim() : null;
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        throw createAppError(
          "Status must be either 'active' or 'inactive'",
          400,
          "INVALID_STATUS"
        );
      }
      updateData.status = status;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const currency = await CurrencyMasterService.updateCurrency(
      id,
      updateData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Currency updated successfully",
      data: currency,
    });
  } catch (error) {
    next(error);
  }
};

// Delete currency (soft delete)
export const deleteCurrency = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError(
        "Currency ID is required",
        400,
        "CURRENCY_ID_REQUIRED"
      );
    }

    const currency = await CurrencyMasterService.deleteCurrency(id, req.admin.id);

    res.status(200).json({
      success: true,
      message: "Currency deleted successfully",
      data: currency,
    });
  } catch (error) {
    next(error);
  }
};

// Permanently delete currency
export const permanentDeleteCurrency = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError(
        "Currency ID is required",
        400,
        "CURRENCY_ID_REQUIRED"
      );
    }

    const result = await CurrencyMasterService.permanentDeleteCurrency(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

// Get active currencies only
export const getActiveCurrencies = async (req, res, next) => {
  try {
    const currencies = await CurrencyMasterService.getActiveCurrencies();

    res.status(200).json({
      success: true,
      message: "Active currencies retrieved successfully",
      data: currencies,
    });
  } catch (error) {
    next(error);
  }
};

// Get currency by code
export const getCurrencyByCode = async (req, res, next) => {
  try {
    const { code } = req.params;

    if (!code) {
      throw createAppError(
        "Currency code is required",
        400,
        "CURRENCY_CODE_REQUIRED"
      );
    }

    const currency = await CurrencyMasterService.getCurrencyByCode(code);

    res.status(200).json({
      success: true,
      message: "Currency retrieved successfully",
      data: currency,
    });
  } catch (error) {
    next(error);
  }
};