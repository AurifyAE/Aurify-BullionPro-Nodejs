import { createAppError } from "../../utils/errorHandler.js";
import MetalRateMasterService from "../../services/modules/MetalRateMasterService.js";

// Create metal rate
export const createMetalRate = async (req, res, next) => {
  try {
    const {
      metal,
      rateType,
      convFactGms,
      currencyId,
      status,
      convertrate,
      posMarginMin,
      posMarginMax,
      addOnRate,
      isDefault,
      range
    } = req.body;
    
    // Validation
    if (
      !metal ||
      !rateType ||
      !convFactGms ||
      !currencyId ||
      convertrate === undefined ||
      posMarginMin === undefined ||
      posMarginMax === undefined ||
      addOnRate === undefined
    ) {
      throw createAppError(
        "All required fields must be provided: metal, rateType, convFactGms, currencyId, currentRate, posMarginMin, posMarginMax, addOnRate",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    // Validate number fields
    if (
      isNaN(convFactGms) ||
      isNaN(convertrate) ||
      isNaN(posMarginMin) ||
      isNaN(posMarginMax) ||
      isNaN(addOnRate)
    ) {
      throw createAppError(
        "Numeric fields must be valid numbers",
        400,
        "INVALID_NUMERIC_VALUES"
      );
    }

    // Validate margin values
    if (parseFloat(posMarginMax) < parseFloat(posMarginMin)) {
      throw createAppError(
        "POS Margin Max must be greater than or equal to POS Margin Min",
        400,
        "INVALID_MARGIN_RANGE"
      );
    }

    const metalRateData = {
      metal: metal,
      rateType: rateType.trim().toUpperCase(),
      convFactGms: parseFloat(convFactGms),
      currencyId,
      status: status || 'active',
      convertrate: parseFloat(convertrate),
      posMarginMin: parseFloat(posMarginMin),
      posMarginMax: parseFloat(posMarginMax),
      addOnRate: parseFloat(addOnRate),
      isDefault: isDefault || false,
      range: range?.toString().trim() || ""
    };

    const metalRate = await MetalRateMasterService.createMetalRate(
      metalRateData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Metal rate created successfully",
      data: metalRate
    });
  } catch (error) {
    next(error);
  }
};

// Get all metal rates
export const getAllMetalRates = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      metal,
      rateType,
      status,
      isActive,
      isDefault
    } = req.query;

    const filters = {};
    if (metal) filters.metal = metal;
    if (rateType) filters.rateType = rateType;
    if (status) filters.status = status;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (isDefault !== undefined) filters.isDefault = isDefault === 'true';

    const result = await MetalRateMasterService.getAllMetalRates(
      parseInt(page),
      parseInt(limit),
      filters
    );

    res.status(200).json({
      success: true,
      message: "Metal rates retrieved successfully",
      data: result.metalRates,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// Get metal rate by ID
export const getMetalRateById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Metal rate ID is required", 400, "ID_REQUIRED");
    }

    const metalRate = await MetalRateMasterService.getMetalRateById(id);

    res.status(200).json({
      success: true,
      message: "Metal rate retrieved successfully",
      data: metalRate
    });
  } catch (error) {
    next(error);
  }
};

// Update metal rate
export const updateMetalRate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      throw createAppError("Metal rate ID is required", 400, "ID_REQUIRED");
    }

    // Validate numeric fields if provided
    const numericFields = ['convFactGms', 'convertrate', 'posMarginMin', 'posMarginMax', 'addOnRate'];
    for (const field of numericFields) {
      if (updateData[field] !== undefined && isNaN(updateData[field])) {
        throw createAppError(
          `${field} must be a valid number`,
          400,
          "INVALID_NUMERIC_VALUE"
        );
      }
    }

    // Validate margin range if both values are provided
    if (updateData.posMarginMin !== undefined && updateData.posMarginMax !== undefined) {
      if (parseFloat(updateData.posMarginMax) < parseFloat(updateData.posMarginMin)) {
        throw createAppError(
          "POS Margin Max must be greater than or equal to POS Margin Min",
          400,
          "INVALID_MARGIN_RANGE"
        );
      }
    }

    // Clean and format data
    if (updateData.metal) updateData.metal = updateData.metal;
    if (updateData.rateType) updateData.rateType = updateData.rateType.trim().toUpperCase();

    const metalRate = await MetalRateMasterService.updateMetalRate(
      id,
      updateData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Metal rate updated successfully",
      data: metalRate
    });
  } catch (error) {
    next(error);
  }
};

// Delete metal rate
export const deleteMetalRate = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Metal rate ID is required", 400, "ID_REQUIRED");
    }

    const result = await MetalRateMasterService.deleteMetalRate(id);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    next(error);
  }
};

// Get active metal rates by division
export const getActiveMetalRatesByDivision = async (req, res, next) => {
  try {
    const { divisionId } = req.params;

    if (!divisionId) {
      throw createAppError("Division ID is required", 400, "DIVISION_ID_REQUIRED");
    }

    const metalRates = await MetalRateMasterService.getActiveMetalRatesByDivision(divisionId);

    res.status(200).json({
      success: true,
      message: "Active metal rates retrieved successfully",
      data: metalRates
    });
  } catch (error) {
    next(error);
  }
};