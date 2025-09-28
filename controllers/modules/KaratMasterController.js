import KaratMaster from "../../models/modules/KaratMaster.js";
import KaratMasterService from "../../services/modules/KaratMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";
export const createKarat = async (req, res, next) => {
  try {
    let {
      karatCode,
      division,
      description,
      standardPurity,
      minimum,
      maximum,
      isScrap,
    } = req.body;

    minimum = minimum ?? 0;
    maximum = maximum ?? 0;


    // Validation
    if (
      !karatCode ||
      !division ||
      !description ||
      minimum === undefined ||
      maximum === undefined ||
      standardPurity === undefined
    ) {
      throw createAppError(
        "All fields are required: karatCode, division, description, standardPurity, minimum, maximum",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    // Validate numeric fields
    if (isNaN(standardPurity) || isNaN(minimum) || isNaN(maximum)) {
      throw createAppError(
        "Standard purity, minimum, and maximum must be valid numbers",
        400,
        "INVALID_NUMERIC_VALUES"
      );
    }
    if (isNaN(standardPurity)) {
      throw createAppError(
        "Standard purity, minimum, and maximum must be valid numbers",
        400,
        "INVALID_NUMERIC_VALUES"
      );
    }

    // Validate standard purity range
    if (standardPurity < 0 || standardPurity > 100) {
      throw createAppError(
        "Standard purity must be between 0 and 100",
        400,
        "INVALID_PURITY_RANGE"
      );
    }

    // Validate min/max based on isScrap
    if (!isScrap) {
      if (minimum < 0 || maximum < 0) {
        throw createAppError(
          "Minimum and maximum values cannot be negative for non-scrap items",
          400,
          "INVALID_VALUE_RANGE"
        );
      }
    }

    // Handle 0-100 range validation if min & max are NOT zero
    if (!(minimum === 0 && maximum === 0)) {
      if (minimum < 0 || minimum > 100 || maximum < 0 || maximum > 100) {
        throw createAppError(
          "Minimum and maximum must be between 0 and 100",
          400,
          "INVALID_MIN_MAX_RANGE"
        );
      }

      // Also validate min < max
      if (minimum >= maximum) {

        throw createAppError(
          "Minimum value must be less than maximum value",
          400,
          "INVALID_MIN_MAX_RANGE"
        );
      }
    }


    // Common validation: minimum must be less than maximum
    if (!(minimum === 0 && maximum === 0) && minimum >= maximum) {

      throw createAppError(
        "Minimum value must be less than maximum value",
        400,
        "INVALID_MIN_MAX_RANGE"
      );
    }

    const karatData = {
      karatCode: karatCode.trim(),
      division,
      description: description.trim(),
      standardPurity: parseFloat(standardPurity),
      minimum: parseFloat(minimum) || 0,
      maximum: parseFloat(maximum) || 0,
      isScrap: isScrap || false,
    };

    const karat = await KaratMasterService.createKarat(karatData, req.admin.id);

    res.status(201).json({
      success: true,
      message: "Karat created successfully",
      data: karat,
    });
  } catch (error) {
    next(error);
  }
};

// Get all karats with pagination and filters
export const getKarats = async (req, res, next) => {
  try {
    const result = await KaratMasterService.getKarats(req.query);

    res.status(200).json({
      success: true,
      message: "Karats fetched successfully",
      data: result.karats,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get karat by ID
export const getKarat = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Karat ID is required", 400, "ID_REQUIRED");
    }

    const karat = await KaratMasterService.getKaratById(id);

    res.status(200).json({
      success: true,
      message: "Karat fetched successfully",
      data: karat,
    });
  } catch (error) {
    next(error);
  }
};

// Update karat
export const updateKarat = async (req, res, next) => {
  try {


    const { id } = req.params;
    const updateData = req.body;


    if (!id) {
      throw createAppError("Karat ID is required", 400, "ID_REQUIRED");
    }

    // Get existing karat to check current isScrap status
    const existingKarat = await KaratMaster.findById(id);

    if (!existingKarat) {
      throw createAppError("Karat not found", 404, "KARAT_NOT_FOUND");
    }

    // Determine if this is/will be a scrap item
    const willBeScrap = updateData.isScrap !== undefined ? updateData.isScrap : existingKarat.isScrap;

    // Validate numeric fields if provided
    if (updateData.standardPurity !== undefined) {
      if (isNaN(updateData.standardPurity)) {
        throw createAppError(
          "Standard purity must be a valid number",
          400,
          "INVALID_PURITY"
        );
      }
      if (updateData.standardPurity < 0 || updateData.standardPurity > 100) {
        throw createAppError(
          "Standard purity must be between 0 and 100",
          400,
          "INVALID_PURITY_RANGE"
        );
      }
      updateData.standardPurity = parseFloat(updateData.standardPurity);
    }

    if (updateData.minimum !== undefined) {
      if (isNaN(updateData.minimum)) {
        throw createAppError(
          "Minimum must be a valid number",
          400,
          "INVALID_MINIMUM"
        );
      }
      // Only validate negative values for non-scrap items
      if (!willBeScrap && updateData.minimum < 0) {
        throw createAppError(
          "Minimum cannot be negative for non-scrap items",
          400,
          "INVALID_MINIMUM"
        );
      }
      updateData.minimum = parseFloat(updateData.minimum);
    }

    if (updateData.maximum !== undefined) {
      if (isNaN(updateData.maximum)) {
        throw createAppError(
          "Maximum must be a valid number",
          400,
          "INVALID_MAXIMUM"
        );
      }
      // Only validate negative values for non-scrap items
      if (!willBeScrap && updateData.maximum < 0) {
        throw createAppError(
          "Maximum cannot be negative for non-scrap items",
          400,
          "INVALID_MAXIMUM"
        );
      }
      updateData.maximum = parseFloat(updateData.maximum);
    }

    // Validate min/max relationship
    const finalMinimum = updateData.minimum !== undefined ? updateData.minimum : existingKarat.minimum;
    const finalMaximum = updateData.maximum !== undefined ? updateData.maximum : existingKarat.maximum;

    if (!(finalMinimum === 0 && finalMaximum === 0) && finalMinimum >= finalMaximum) {
      throw createAppError(
        "Minimum value must be less than maximum value",
        400,
        "INVALID_MIN_MAX_RANGE"
      );
    }


    // Trim string fields if provided
    if (updateData.karatCode) {
      updateData.karatCode = updateData.karatCode.trim();
    }
    if (updateData.description) {
      updateData.description = updateData.description.trim();
    }


    const updatedKarat = await KaratMasterService.updateKarat(
      id,
      updateData,
      req.admin.id
    );


    res.status(200).json({
      success: true,
      message: "Karat updated successfully",
      data: updatedKarat,
    });
  } catch (error) {
    next(error);
  }
};

// Delete karat (soft delete)
export const deleteKarat = async (req, res, next) => {
  try {
    const { id } = req.params;
  

    if (!id) {
      throw createAppError("Karat ID is required", 400, "ID_REQUIRED");
    }

    const deletedKarat = await KaratMasterService.deleteKarat(id, req.admin.id);

    res.status(200).json({
      success: true,
      message: "Karat deleted successfully",
      data: deletedKarat,
    });
  } catch (error) {
    next(error);
  }
};

// Permanent delete karat (hard delete)
export const permanentDeleteKarat = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Karat ID is required", 400, "ID_REQUIRED");
    }

    const deletedKarat = await KaratMasterService.permanentDeleteKarat(id);

    res.status(200).json({
      success: true,
      message: "Karat permanently deleted successfully",
      data: deletedKarat,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk permanent delete
export const bulkPermanentDeleteKarats = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createAppError(
        "IDs array is required and cannot be empty",
        400,
        "IDS_REQUIRED"
      );
    }

    // Validate all IDs are valid ObjectIds
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      throw createAppError(
        `Invalid ID format for: ${invalidIds.join(", ")}`,
        400,
        "INVALID_ID_FORMAT"
      );
    }

    const result = await KaratMasterService.bulkPermanentDelete(ids);

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} karats permanently deleted successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Get karats by division
export const getKaratsByDivision = async (req, res, next) => {
  try {
    const { divisionId } = req.params;

    if (!divisionId) {
      throw createAppError(
        "Division ID is required",
        400,
        "DIVISION_ID_REQUIRED"
      );
    }

    const karats = await KaratMasterService.getKaratsByDivision(divisionId);

    res.status(200).json({
      success: true,
      message: "Karats fetched successfully",
      data: karats,
    });
  } catch (error) {
    next(error);
  }
};

// Bulk update status
export const bulkUpdateKaratStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createAppError(
        "IDs array is required and cannot be empty",
        400,
        "IDS_REQUIRED"
      );
    }

    if (!status || !["active", "inactive"].includes(status)) {
      throw createAppError(
        "Status must be either 'active' or 'inactive'",
        400,
        "INVALID_STATUS"
      );
    }

    const result = await KaratMasterService.bulkUpdateStatus(
      ids,
      status,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} karats updated successfully`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle karat status
export const toggleKaratStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Karat ID is required", 400, "ID_REQUIRED");
    }

    // Get current karat to determine new status
    const currentKarat = await KaratMasterService.getKaratById(id);
    const newStatus = currentKarat.status === "active" ? "inactive" : "active";

    const updatedKarat = await KaratMasterService.updateKarat(
      id,
      {
        status: newStatus,
        isActive: newStatus === "active",
      },
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: `Karat status updated to ${newStatus}`,
      data: updatedKarat,
    });
  } catch (error) {
    next(error);
  }
};
