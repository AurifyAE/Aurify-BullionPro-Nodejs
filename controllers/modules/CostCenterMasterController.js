import { CostCenterMasterService } from "../../services/modules/CostCenterMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

// Create Cost Center
export const createCostCenter = async (req, res, next) => {
  try {
    const { code, description } = req.body;

    // Validation
    if (!code || !description) {
      throw createAppError(
        "All fields are required: code, description",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    const costCenterData = {
      code: code.trim(),
      description: description.trim(),
    };

    const costCenter = await CostCenterMasterService.createCostCenter(
      costCenterData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Cost Center created successfully",
      data: costCenter,
    });
  } catch (error) {
    next(error);
  }
};

// Get all Cost Centers
export const getAllCostCenters = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = ''
    } = req.query;

    const result = await CostCenterMasterService.getAllCostCenters(
      page,
      limit,
      search,
      status
    );

    res.status(200).json({
      success: true,
      message: "Cost Centers retrieved successfully",
      data: result.costCenters,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get Cost Center by ID
export const getCostCenterById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Cost Center ID is required", 400, "MISSING_ID");
    }

    const costCenter = await CostCenterMasterService.getCostCenterById(id);

    res.status(200).json({
      success: true,
      message: "Cost Center retrieved successfully",
      data: costCenter,
    });
  } catch (error) {
    next(error);
  }
};

// Update Cost Center
export const updateCostCenter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, description, status } = req.body;

    if (!id) {
      throw createAppError("Cost Center ID is required", 400, "MISSING_ID");
    }

    // Validation - at least one field should be provided
    if (!code && !description && !status) {
      throw createAppError(
        "At least one field is required to update: code, description, or status",
        400,
        "NO_UPDATE_FIELDS"
      );
    }

    const updateData = {};
    if (code) updateData.code = code.trim();
    if (description) updateData.description = description.trim();
    if (status) updateData.status = status;

    const costCenter = await CostCenterMasterService.updateCostCenter(
      id,
      updateData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Cost Center updated successfully",
      data: costCenter,
    });
  } catch (error) {
    next(error);
  }
};

// Delete Cost Center (Soft Delete)
export const deleteCostCenter = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Cost Center ID is required", 400, "MISSING_ID");
    }

    const costCenter = await CostCenterMasterService.deleteCostCenter(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Cost Center deleted successfully",
      data: costCenter,
    });
  } catch (error) {
    next(error);
  }
};

// Permanently Delete Cost Center
export const permanentDeleteCostCenter = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Cost Center ID is required", 400, "MISSING_ID");
    }

    const result = await CostCenterMasterService.permanentDeleteCostCenter(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

// Restore Cost Center
export const restoreCostCenter = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Cost Center ID is required", 400, "MISSING_ID");
    }

    const costCenter = await CostCenterMasterService.restoreCostCenter(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Cost Center restored successfully",
      data: costCenter,
    });
  } catch (error) {
    next(error);
  }
};