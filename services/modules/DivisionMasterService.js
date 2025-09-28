import DivisionMaster from "../../models/modules/DivisionMaster.js";
import CostCenterMaster from "../../models/modules/CostCenterMaster.js";
import { createAppError } from "../../utils/errorHandler.js";
import mongoose from "mongoose";

export const DivisionMasterService = {
  // Create Division
  createDivision: async (divisionData, adminId) => {
    try {
      // Check if code already exists
      const isCodeExists = await DivisionMaster.isCodeExists(divisionData.code);
      if (isCodeExists) {
        throw createAppError(
          `Division with code '${divisionData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      // Validate cost center references if provided
      if (divisionData.costCenter) {
        if (!mongoose.Types.ObjectId.isValid(divisionData.costCenter)) {
          throw createAppError("Invalid Cost Center ID", 400, "INVALID_COST_CENTER_ID");
        }
        const costCenter = await CostCenterMaster.findById(divisionData.costCenter);
        if (!costCenter) {
          throw createAppError("Cost Center not found", 404, "COST_CENTER_NOT_FOUND");
        }
        if (costCenter.status !== "active") {
          throw createAppError("Cost Center is not active", 400, "COST_CENTER_INACTIVE");
        }
      }

      if (divisionData.costCenterMaking) {
        if (!mongoose.Types.ObjectId.isValid(divisionData.costCenterMaking)) {
          throw createAppError("Invalid Cost Center Making ID", 400, "INVALID_COST_CENTER_MAKING_ID");
        }
        const costCenterMaking = await CostCenterMaster.findById(divisionData.costCenterMaking);
        if (!costCenterMaking) {
          throw createAppError("Cost Center Making not found", 404, "COST_CENTER_MAKING_NOT_FOUND");
        }
        if (costCenterMaking.status !== "active") {
          throw createAppError("Cost Center Making is not active", 400, "COST_CENTER_MAKING_INACTIVE");
        }
      }

      const division = new DivisionMaster({
        ...divisionData,
        createdBy: adminId
      });

      await division.save();
      
      return await DivisionMaster.findById(division._id)
        .populate('createdBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description');
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Division code must be unique",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  },

  // Get all Divisions with pagination and filtering
  getAllDivisions: async (page = 1, limit = 10, search = '', status = '') => {
    try {
      const skip = (page - 1) * limit;
      
      // Build filter query
      const filter = {};
      if (search) {
        filter.$or = [
          { code: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { autoFixStockCode: { $regex: search, $options: 'i' } }
        ];
      }
      if (status) {
        filter.status = status;
      }

      const divisions = await DivisionMaster.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await DivisionMaster.countDocuments(filter);

      return {
        divisions,
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

  // Get Division by ID
  getDivisionById: async (id) => {
    try {
      const division = await DivisionMaster.findById(id)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description');

      if (!division) {
        throw createAppError("Division not found", 404, "NOT_FOUND");
      }

      return division;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Division ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Update Division
  updateDivision: async (id, updateData, adminId) => {
    try {
      const division = await DivisionMaster.findById(id);
      if (!division) {
        throw createAppError("Division not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== division.code) {
        const isCodeExists = await DivisionMaster.isCodeExists(updateData.code, id);
        if (isCodeExists) {
          throw createAppError(
            `Division with code '${updateData.code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      // Validate cost center references if being updated
      if (updateData.costCenter) {
        if (!mongoose.Types.ObjectId.isValid(updateData.costCenter)) {
          throw createAppError("Invalid Cost Center ID", 400, "INVALID_COST_CENTER_ID");
        }
        const costCenter = await CostCenterMaster.findById(updateData.costCenter);
        if (!costCenter) {
          throw createAppError("Cost Center not found", 404, "COST_CENTER_NOT_FOUND");
        }
        if (costCenter.status !== "active") {
          throw createAppError("Cost Center is not active", 400, "COST_CENTER_INACTIVE");
        }
      }

      if (updateData.costCenterMaking) {
        if (!mongoose.Types.ObjectId.isValid(updateData.costCenterMaking)) {
          throw createAppError("Invalid Cost Center Making ID", 400, "INVALID_COST_CENTER_MAKING_ID");
        }
        const costCenterMaking = await CostCenterMaster.findById(updateData.costCenterMaking);
        if (!costCenterMaking) {
          throw createAppError("Cost Center Making not found", 404, "COST_CENTER_MAKING_NOT_FOUND");
        }
        if (costCenterMaking.status !== "active") {
          throw createAppError("Cost Center Making is not active", 400, "COST_CENTER_MAKING_INACTIVE");
        }
      }

      const updatedDivision = await DivisionMaster.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updatedBy: adminId
        },
        { new: true, runValidators: true }
      )
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description');

      return updatedDivision;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Division ID", 400, "INVALID_ID");
      }
      if (error.code === 11000) {
        throw createAppError(
          "Division code must be unique",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  },

  // Delete Division (Soft Delete)
  deleteDivision: async (id, adminId) => {
    try {
      const division = await DivisionMaster.findById(id);
      if (!division) {
        throw createAppError("Division not found", 404, "NOT_FOUND");
      }

      const deletedDivision = await DivisionMaster.findByIdAndUpdate(
        id,
        {
          status: "inactive",
          isActive: false,
          updatedBy: adminId
        },
        { new: true }
      )
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description');

      return deletedDivision;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Division ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Permanently Delete Division
  permanentDeleteDivision: async (id) => {
    try {
      const division = await DivisionMaster.findById(id);
      if (!division) {
        throw createAppError("Division not found", 404, "NOT_FOUND");
      }

      await DivisionMaster.findByIdAndDelete(id);
      return { message: "Division permanently deleted" };
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Division ID", 400, "INVALID_ID");
      }
      throw error;
    }
  },

  // Restore Division
  restoreDivision: async (id, adminId) => {
    try {
      const division = await DivisionMaster.findById(id);
      if (!division) {
        throw createAppError("Division not found", 404, "NOT_FOUND");
      }

      const restoredDivision = await DivisionMaster.findByIdAndUpdate(
        id,
        {
          status: "active",
          isActive: true,
          updatedBy: adminId
        },
        { new: true }
      )
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('costCenter', 'code description')
        .populate('costCenterMaking', 'code description');

      return restoredDivision;
    } catch (error) {
      if (error.name === 'CastError') {
        throw createAppError("Invalid Division ID", 400, "INVALID_ID");
      }
      throw error;
    }
  }
};