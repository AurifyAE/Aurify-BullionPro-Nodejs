import CostCenterMaster from "../../models/modules/CostCenterMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

export const CostCenterMasterService = {
  // Create Cost Center
  createCostCenter: async (costCenterData, adminId) => {
    try {
      // Check if code already exists
      const isCodeExists = await CostCenterMaster.isCodeExists(costCenterData.code);
      if (isCodeExists) {
        throw createAppError(
          `Cost Center with code '${costCenterData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const costCenter = new CostCenterMaster({
        ...costCenterData,
        createdBy: adminId
      });

      await costCenter.save();
      return await CostCenterMaster.findById(costCenter._id).populate('createdBy', 'name email');
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Cost Center code must be unique",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  },

  // Get all Cost Centers with pagination and filtering
  getAllCostCenters: async (page = 1, limit = 10, search = '', status = '') => {
    try {
      const skip = (page - 1) * limit;
      
      // Build filter query
      const filter = {};
      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      if (status) {
        filter.status = status;
      }

      const costCenters = await CostCenterMaster.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await CostCenterMaster.countDocuments(filter);

      return {
        costCenters,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      };
    } catch (error) {
      throw error;
    }
  },

  // Get Cost Center by ID
  getCostCenterById: async (id) => {
    try {
      const costCenter = await CostCenterMaster.findById(id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email');

      if (!costCenter) {
        throw createAppError("Cost Center not found", 404, "NOT_FOUND");
      }

      return costCenter;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Cost Center ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Update Cost Center
  updateCostCenter: async (id, updateData, adminId) => {
    try {
      const costCenter = await CostCenterMaster.findById(id);
      if (!costCenter) {
        throw createAppError("Cost Center not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== costCenter.code) {
        const isCodeExists = await CostCenterMaster.isCodeExists(updateData.code, id);
        if (isCodeExists) {
          throw createAppError(
            `Cost Center with code '${updateData.code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedCostCenter = await CostCenterMaster.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updatedBy: adminId
        },
        { new: true, runValidators: true }
      ).populate('createdBy', 'name email').populate('updatedBy', 'name email');

      return updatedCostCenter;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Cost Center ID", 400, "INVALID_ID");
      }
      if (error.code === 11000) {
        throw createAppError(
          "Cost Center code must be unique",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  },

  // Delete Cost Center (Soft Delete)
  deleteCostCenter: async (id, adminId) => {
    try {
      const costCenter = await CostCenterMaster.findById(id);
      if (!costCenter) {
        throw createAppError("Cost Center not found", 404, "NOT_FOUND");
      }

      const deletedCostCenter = await CostCenterMaster.findByIdAndUpdate(
        id,
        {
          status: "inactive",
          isActive: false,
          updatedBy: adminId
        },
        { new: true }
      ).populate('createdBy', 'name email').populate('updatedBy', 'name email');

      return deletedCostCenter;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Cost Center ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Permanently Delete Cost Center
  permanentDeleteCostCenter: async (id) => {
    try {
      const costCenter = await CostCenterMaster.findById(id);
      if (!costCenter) {
        throw createAppError("Cost Center not found", 404, "NOT_FOUND");
      }

      await CostCenterMaster.findByIdAndDelete(id);
      return { message: "Cost Center permanently deleted" };
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Cost Center ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Restore Cost Center
  restoreCostCenter: async (id, adminId) => {
    try {
      const costCenter = await CostCenterMaster.findById(id);
      if (!costCenter) {
        throw createAppError("Cost Center not found", 404, "NOT_FOUND");
      }

      const restoredCostCenter = await CostCenterMaster.findByIdAndUpdate(
        id,
        {
          status: "active",
          isActive: true,
          updatedBy: adminId
        },
        { new: true }
      ).populate('createdBy', 'name email').populate('updatedBy', 'name email');

      return restoredCostCenter;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Cost Center ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }
};
