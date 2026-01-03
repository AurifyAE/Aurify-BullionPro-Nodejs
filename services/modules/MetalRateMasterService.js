import MetalRateMaster from "../../models/modules/MetalRateMaster.js";
import DivisionMaster from "../../models/modules/DivisionMaster.js";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import { createAppError } from "../../utils/errorHandler.js";

class MetalRateMasterService {
  // Create new metal rate
  static async createMetalRate(metalRateData, adminId) {
    try {
      // Extract metal ID if it's an object (safeguard against frontend sending object)
      if (metalRateData.metal) {
        if (typeof metalRateData.metal === 'object' && metalRateData.metal !== null) {
          metalRateData.metal = metalRateData.metal._id || metalRateData.metal.id || metalRateData.metal;
        }
      }
      
      // Check if division exists
      const division = await DivisionMaster.findById(metalRateData.metal);
      if (!division) {
        throw createAppError("Division not found", 404, "DIVISION_NOT_FOUND");
      }

      if (metalRateData.rateType) {
        metalRateData.rateType = metalRateData.rateType.trim().toUpperCase();
      }

      // Validate required fields before checking duplicates
      if (!metalRateData.metal || !metalRateData.rateType) {
        throw createAppError(
          "Metal (division) and Rate Type are required",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      // Check if metal rate combination already exists (check ALL records, regardless of isActive status)
      // This prevents duplicates even if previous record is inactive or soft-deleted
      const existingMetalRate = await MetalRateMaster.findOne({
        metal: metalRateData.metal,
        rateType: metalRateData.rateType,
      });

      if (existingMetalRate) {
        const divisionCode = division.code || division.description || "Unknown";
        const statusText = existingMetalRate.isActive ? "active" : "inactive";
        throw createAppError(
          `Metal rate with combination (Division: ${divisionCode}, Rate Type: ${metalRateData.rateType}) already exists (Status: ${statusText}). Duplicate combinations are not allowed.`,
          409,
          "METAL_RATE_EXISTS"
        );
      }

      // If setting as default, unset all other default rates for the same division
      if (metalRateData.isDefault === true) {
        await MetalRateMaster.updateMany(
          { 
            metal: metalRateData.metal,
            isDefault: true 
          },
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

      // Extract metal ID if it's an object (safeguard against frontend sending object)
      if (updateData.metal) {
        if (typeof updateData.metal === 'object' && updateData.metal !== null) {
          updateData.metal = updateData.metal._id || updateData.metal.id || updateData.metal;
        }
        
        const division = await DivisionMaster.findById(updateData.metal);
        if (!division) {
          throw createAppError("Division not found", 404, "DIVISION_NOT_FOUND");
        }
      }

      if (updateData.rateType) {
        updateData.rateType = updateData.rateType.trim().toUpperCase();
      }

      // Check for duplicate metal rate combination (if key fields are being updated)
      if (updateData.metal || updateData.rateType) {
        const checkMetal = updateData.metal || metalRate.metal;
        const checkRateType = updateData.rateType || metalRate.rateType;

        // Check if combination already exists (excluding current record, check ALL records)
        const existingMetalRate = await MetalRateMaster.findOne({
          _id: { $ne: id },
          metal: checkMetal,
          rateType: checkRateType,
        });

        if (existingMetalRate) {
          const division = await DivisionMaster.findById(checkMetal);
          const divisionCode = division?.code || division?.description || "Unknown";
          const statusText = existingMetalRate.isActive ? "active" : "inactive";
          throw createAppError(
            `Metal rate with combination (Division: ${divisionCode}, Rate Type: ${checkRateType}) already exists (Status: ${statusText}). Duplicate combinations are not allowed.`,
            409,
            "METAL_RATE_EXISTS"
          );
        }
      }

      // Determine which division to check for defaults
      const targetDivision = updateData.metal || metalRate.metal;
      
      // If setting as default, unset all other default rates for the same division
      if (updateData.isDefault === true) {
        await MetalRateMaster.updateMany(
          { 
            _id: { $ne: id },
            metal: targetDivision,
            isDefault: true 
          },
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
      console.log(id);
      console.log("deleteMetalRate");
      const metalRate = await MetalRateMaster.findById(id);
      if (!metalRate) {
        throw createAppError(
          "Metal rate not found",
          404,
          "METAL_RATE_NOT_FOUND"
        );
      }

      // Check if this metal rate type is being used in any MetalTransaction stockItems array
      const isUsedInTransaction = await MetalTransaction.findOne({
        stockItems: {
          $elemMatch: {
            metalRate: id
          }
        }
      });

      if (isUsedInTransaction) {
        throw createAppError(
          "Cannot delete metal rate type. It is currently being used in metal transactions.",
          400,
          "METAL_RATE_IN_USE"
        );
      }


      await MetalRateMaster.findByIdAndDelete(id);

      return { message: "Metal rate deleted successfully" };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  // Get active metal rates by division
  static async getActiveMetalRatesByDivision(divisionId) {
    try {
      const metalRates = await MetalRateMaster.find({
        metal: divisionId,
        isActive: true,
      })
        .populate([
          { path: "metal", select: "code description" },
          { path: "currencyId", select: "code name symbol" }
        ])
        .sort({ isDefault: -1, rateType: 1 }); // Sort by isDefault first (true first), then by rateType

      return metalRates;
    } catch (error) {
      throw error;
    }
  }
}

export default MetalRateMasterService;