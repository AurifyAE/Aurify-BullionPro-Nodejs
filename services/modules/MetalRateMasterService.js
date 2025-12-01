import MetalRateMaster from "../../models/modules/MetalRateMaster.js";
import DivisionMaster from "../../models/modules/DivisionMaster.js";
import { createAppError } from "../../utils/errorHandler.js";

class MetalRateMasterService {
  // Create new metal rate
  static async createMetalRate(metalRateData, adminId) {
    try {
      // Check if division exists
      const division = await DivisionMaster.findById(metalRateData.metal);
      if (!division) {
        throw createAppError("Division not found", 404, "DIVISION_NOT_FOUND");
      }

      // Check if metal rate combination already exists
      const existingMetalRate = await MetalRateMaster.isMetalRateExists(
        metalRateData.metal,
        metalRateData.rateType
      );

      if (existingMetalRate) {
        throw createAppError(
          "Metal rate with this combination already exists",
          409,
          "METAL_RATE_EXISTS"
        );
      }

      // If setting as default, unset all other default rates
      if (metalRateData.isDefault === true) {
        await MetalRateMaster.updateMany(
          { isDefault: true },
          { isDefault: false }
        );
      }

      const metalRate = new MetalRateMaster({
        ...metalRateData,
        createdBy: adminId,
      });

      await metalRate.save();

      // Populate related data
      await metalRate.populate([
        { path: "metal", select: "code description" },
        { path: "currencyId", select: "currencyCode description symbol" },
        { path: "createdBy", select: "name email" },
      ]);

      return metalRate;
    } catch (error) {
      throw error;
    }
  }

  // Get all metal rates with pagination and filtering
  static async getAllMetalRates(page = 1, limit = 10, filters = {}) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      // Apply filters
      if (filters.metal) {
        query.metal = filters.metal;
      }
      if (filters.rateType) {
        query.rateType = filters.rateType;
      }
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      }
      if (filters.isDefault !== undefined) {
        query.isDefault = filters.isDefault;
      }

      const [metalRates, total] = await Promise.all([
        MetalRateMaster.find(query)
          .populate([
            { path: "metal", select: "code description" },
            { path: "currencyId", select: "currencyCode description symbol" },
            { path: "createdBy", select: "name email" },
            { path: "updatedBy", select: "name email" },
          ])
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        MetalRateMaster.countDocuments(query),
      ]);

      return {
        metalRates,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get metal rate by ID
  static async getMetalRateById(id) {
    try {
      const metalRate = await MetalRateMaster.findById(id).populate([
        { path: "divisionId", select: "code description costCenter" },
        { path: "currencyId", select: "currencyCode description symbol" },
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      if (!metalRate) {
        throw createAppError(
          "Metal rate not found",
          404,
          "METAL_RATE_NOT_FOUND"
        );
      }

      return metalRate;
    } catch (error) {
      throw error;
    }
  }

  // Update metal rate
  static async updateMetalRate(id, updateData, adminId) {
    try {
      const metalRate = await MetalRateMaster.findById(id);
      if (!metalRate) {
        throw createAppError(
          "Metal rate not found",
          404,
          "METAL_RATE_NOT_FOUND"
        );
      }

      // Check if division exists (if being updated)
      if (updateData.metal) {
        const division = await DivisionMaster.findById(updateData.metal);
        if (!division) {
          throw createAppError("Division not found", 404, "DIVISION_NOT_FOUND");
        }
      }

      // Check for duplicate metal rate combination (if key fields are being updated)
      if (updateData.metal ||  updateData.rateType) {
        const checkMetal = updateData.metal || metalRate.metal;
        const checkRateType = updateData.rateType || metalRate.rateType;

        const existingMetalRate = await MetalRateMaster.isMetalRateExists(
          checkMetal,
          checkRateType,
          id
        );

        if (existingMetalRate) {
          throw createAppError(
            "Metal rate with this combination already exists",
            409,
            "METAL_RATE_EXISTS"
          );
        }
      }

      // If setting as default, unset all other default rates (except the current one)
      if (updateData.isDefault === true) {
        await MetalRateMaster.updateMany(
          { _id: { $ne: id }, isDefault: true },
          { isDefault: false }
        );
      }

      // Update metal rate
      Object.assign(metalRate, updateData, { updatedBy: adminId });
      await metalRate.save();

      // Populate related data
      await metalRate.populate([
        { path: "metal", select: "code description" },
        { path: "currencyId", select: "currencyCode description symbol" },
        { path: "updatedBy", select: "name email" },
      ]);

      return metalRate;
    } catch (error) {
      throw error;
    }
  }

  // Delete metal rate (soft delete)
  static async deleteMetalRate(id) {
    try {
      const metalRate = await MetalRateMaster.findById(id);
      if (!metalRate) {
        throw createAppError(
          "Metal rate not found",
          404,
          "METAL_RATE_NOT_FOUND"
        );
      }

      // Soft delete by updating status and isActive
      metalRate.status = "inactive";
      metalRate.isActive = false;
      await metalRate.save();

      return { message: "Metal rate deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // Get active metal rates by division
  static async getActiveMetalRatesByDivision(divisionId) {
    try {
      const metalRates = await MetalRateMaster.find({
        divisionId: divisionId,
        status: "active",
        isActive: true,
      })
        .populate([{ path: "currencyId", select: "code name symbol" }])
        .sort({ metal: 1 });

      return metalRates;
    } catch (error) {
      throw error;
    }
  }
}

export default MetalRateMasterService;