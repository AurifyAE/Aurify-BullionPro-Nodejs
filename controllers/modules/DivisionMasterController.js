import { DivisionMasterService } from "../../services/modules/DivisionMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

// Create Division
export const createDivision = async (req, res, next) => {
  try {
    const { code, description, costCenter, costCenterMaking, autoFixStockCode } = req.body;

    // Validation
    if (!code || !description) {
      throw createAppError(
        "All required fields must be provided: code, description",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    const divisionData = {
      code: code.trim(),
      description: description.trim(),
    };

    // Add optional fields if provided
    if (costCenter) divisionData.costCenter = costCenter;
    if (costCenterMaking) divisionData.costCenterMaking = costCenterMaking;
    if (autoFixStockCode) divisionData.autoFixStockCode = autoFixStockCode.trim();

    const division = await DivisionMasterService.createDivision(
      divisionData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Division created successfully",
      data: division,
    });
  } catch (error) {
    next(error);
  }
};

// Get all Divisions
export const getAllDivisions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = ''
    } = req.query;

    const result = await DivisionMasterService.getAllDivisions(
      page,
      limit,
      search,
      status
    );

    res.status(200).json({
      success: true,
      message: "Divisions retrieved successfully",
      data: result.divisions,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get Division by ID
export const getDivisionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Division ID is required", 400, "MISSING_ID");
    }

    const division = await DivisionMasterService.getDivisionById(id);

    res.status(200).json({
      success: true,
      message: "Division retrieved successfully",
      data: division,
    });
  } catch (error) {
    next(error);
  }
};

// Update Division
export const updateDivision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, description, costCenter, costCenterMaking, autoFixStockCode, status } = req.body;

    if (!id) {
      throw createAppError("Division ID is required", 400, "MISSING_ID");
    }

    // Validation - at least one field should be provided
    if (!code && !description && !costCenter && !costCenterMaking && !autoFixStockCode && !status) {
      throw createAppError(
        "At least one field is required to update: code, description, costCenter, costCenterMaking, autoFixStockCode, or status",
        400,
        "NO_UPDATE_FIELDS"
      );
    }

    const updateData = {};
    if (code) updateData.code = code.trim();
    if (description) updateData.description = description.trim();
    if (costCenter !== undefined) updateData.costCenter = costCenter || null;
    if (costCenterMaking !== undefined) updateData.costCenterMaking = costCenterMaking || null;
    if (autoFixStockCode !== undefined) updateData.autoFixStockCode = autoFixStockCode ? autoFixStockCode.trim() : null;
    if (status) updateData.status = status;

    const division = await DivisionMasterService.updateDivision(
      id,
      updateData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Division updated successfully",
      data: division,
    });
  } catch (error) {
    next(error);
  }
};

// Delete Division (Soft Delete)
export const deleteDivision = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Division ID is required", 400, "MISSING_ID");
    }

    const division = await DivisionMasterService.deleteDivision(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Division deleted successfully",
      data: division,
    });
  } catch (error) {
    next(error);
  }
};

// Permanently Delete Division
export const permanentDeleteDivision = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Division ID is required", 400, "MISSING_ID");
    }

    const result = await DivisionMasterService.permanentDeleteDivision(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

// Restore Division
export const restoreDivision = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Division ID is required", 400, "MISSING_ID");
    }

    const division = await DivisionMasterService.restoreDivision(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Division restored successfully",
      data: division,
    });
  } catch (error) {
    next(error);
  }
};