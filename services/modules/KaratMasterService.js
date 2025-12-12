import KaratMaster from "../../models/modules/KaratMaster.js";
import DivisionMaster from "../../models/modules/DivisionMaster.js";
import MetalStock from "../../models/modules/MetalStock.js";
import { createAppError } from "../../utils/errorHandler.js";

class KaratMasterService {
  // Create new karat
  static async createKarat(karatData, adminId) {
    try {
      // Check if division exists and is active
      const division = await DivisionMaster.findById(karatData.division);
      if (!division || !division.isActive) {
        throw createAppError(
          "Division not found or inactive",
          400,
          "DIVISION_NOT_FOUND"
        );
      }

      // Check if karat code already exists for this division
      const existingKarat = await KaratMaster.isKaratCodeExists(
        karatData.karatCode,
        karatData.division
      );
      if (existingKarat) {
        throw createAppError(
          "Karat code already exists for this division",
          400,
          "KARAT_CODE_EXISTS"
        );
      }

      // Create new karat
      const karat = new KaratMaster({
        ...karatData,
        createdBy: adminId,
      });

      await karat.save();

      // Populate division and creator info
      await karat.populate("division", "code description");
      await karat.populate("createdBy", "name email");

      return karat;
    } catch (error) {
      if (
        error.name === "ValidationError" &&
        error.errors &&
        typeof error.errors === "object"
      ) {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(messages.join(", "), 400, "VALIDATION_ERROR");
      }

      throw error;
    }
  }


  // Get all karats with pagination and filters
  static async getKarats(query = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        division = "",
        status = "",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      // Build filter object
      const filter = {};

      if (search) {
        filter.$or = [
          { karatCode: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (division) {
        filter.division = division;
      }

      if (status) {
        filter.status = status;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Execute queries
      const [karats, total] = await Promise.all([
        KaratMaster.find(filter)
          .populate("division", "code description")
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort(sortOptions)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        KaratMaster.countDocuments(filter),
      ]);

      return {
        karats,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw createAppError("Error fetching karats", 500, "FETCH_ERROR");
    }
  }

  // Get karat by ID
  static async getKaratById(id) {
    try {
      const karat = await KaratMaster.findById(id)
        .populate("division", "code description")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!karat) {
        throw createAppError("Karat not found", 404, "KARAT_NOT_FOUND");
      }

      return karat;
    } catch (error) {
      if (error.message === "Karat not found") {
        throw error;
      }
      throw createAppError("Error fetching karat", 500, "FETCH_ERROR");
    }
  }

  // Update karat
  static async updateKarat(id, updateData, adminId) {
    try {
      const existingKarat = await KaratMaster.findById(id);
      if (!existingKarat) {
        throw createAppError("Karat not found", 404, "KARAT_NOT_FOUND");
      }

      // If division is being updated, check if it exists and is active
      if (
        updateData.division &&
        updateData.division !== existingKarat.division.toString()
      ) {
        const division = await DivisionMaster.findById(updateData.division);

       
        if (!division || !division.isActive ) {
          throw createAppError(
            "Division not found or inactive",
            400,
            "DIVISION_NOT_FOUND"
          );
        }
      }

      // If karat code or division is being updated, check for duplicates
      if (updateData.karatCode || updateData.division) {
        const karatCode = updateData.karatCode || existingKarat.karatCode;
        const divisionId = updateData.division || existingKarat.division;

        const existingCode = await KaratMaster.isKaratCodeExists(
          karatCode,
          divisionId,
          id
        );
        if (existingCode) {
          throw createAppError(
            "Karat code already exists for this division",
            400,
            "KARAT_CODE_EXISTS"
          );
        }
      }

      // Update karat
      const updatedKarat = await KaratMaster.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )
        .populate("division", "code description")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedKarat;
    } catch (error) {
      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map((err) => err.message);
        throw createAppError(messages.join(", "), 400, "VALIDATION_ERROR");
      }
      throw error;
    }
  }

  // Delete karat (soft delete)
  static async deleteKarat(id, adminId) {
    try {
      const karat = await KaratMaster.findById(id);
      if (!karat) {
        throw createAppError("Karat not found", 404, "KARAT_NOT_FOUND");
      }

      // Check if karat is used in any MetalStock
      const isUsedInStock = await MetalStock.findOne({
        karat: id,
        isActive: { $ne: false },
        status: { $ne: "inactive" }
      });

      if (isUsedInStock) {
        throw createAppError(
          "Cannot delete karat. It is currently being used in metal stock.",
          400,
          "KARAT_IN_USE"
        );
      }

      // Soft delete by updating status
      const deletedKarat = await KaratMaster.findByIdAndUpdate(
        id,
        {
          status: "inactive",
          isActive: false,
          updatedBy: adminId,
        },
        { new: true }
      )
        .populate("division", "code description")
        .populate("updatedBy", "name email");

      return deletedKarat;
    } catch (error) {
      if (error.message === "Karat not found" || error.code === "KARAT_IN_USE") {
        throw error;
      }
      throw createAppError("Error deleting karat", 500, "DELETE_ERROR");
    }
  }

  // Permanent delete karat (hard delete)
  static async permanentDeleteKarat(id) {
    try {
      const karat = await KaratMaster.findById(id);
      if (!karat) {
        throw createAppError("Karat not found", 404, "KARAT_NOT_FOUND");
      }

      // Store karat details before deletion for response
      const karatDetails = {
        id: karat._id,
        karatCode: karat.karatCode,
        description: karat.description,
      };

      // Permanently delete from database
      await KaratMaster.findByIdAndDelete(id);

      return karatDetails;
    } catch (error) {
      if (error.message === "Karat not found") {
        throw error;
      }
      throw createAppError(
        "Error permanently deleting karat",
        500,
        "PERMANENT_DELETE_ERROR"
      );
    }
  }

  // Bulk permanent delete
  static async bulkPermanentDelete(ids) {
    try {
      // Validate that all IDs exist before deletion
      const existingKarats = await KaratMaster.find({ _id: { $in: ids } });

      if (existingKarats.length !== ids.length) {
        const foundIds = existingKarats.map((k) => k._id.toString());
        const notFoundIds = ids.filter((id) => !foundIds.includes(id));
        throw createAppError(
          `Karats not found: ${notFoundIds.join(", ")}`,
          404,
          "KARATS_NOT_FOUND"
        );
      }

      // Store details before deletion
      const karatDetails = existingKarats.map((karat) => ({
        id: karat._id,
        karatCode: karat.karatCode,
        description: karat.description,
      }));

      // Permanently delete all
      const result = await KaratMaster.deleteMany({ _id: { $in: ids } });

      return {
        deletedCount: result.deletedCount,
        deletedKarats: karatDetails,
      };
    } catch (error) {
      if (error.message.includes("Karats not found")) {
        throw error;
      }
      throw createAppError(
        "Error in bulk permanent delete",
        500,
        "BULK_PERMANENT_DELETE_ERROR"
      );
    }
  }

  // Get karats by division
  static async getKaratsByDivision(divisionId) {
    try {
      const division = await DivisionMaster.findById(divisionId);
      if (!division) {
        throw createAppError("Division not found", 404, "DIVISION_NOT_FOUND");
      }

      const karats = await KaratMaster.getByDivision(divisionId);
      return karats;
    } catch (error) {
      if (error.message === "Division not found") {
        throw error;
      }
      throw createAppError(
        "Error fetching karats by division",
        500,
        "FETCH_ERROR"
      );
    }
  }

  // Bulk operations
  static async bulkUpdateStatus(ids, status, adminId) {
    try {
      const result = await KaratMaster.updateMany(
        { _id: { $in: ids } },
        {
          status,
          isActive: status === "active",
          updatedBy: adminId,
        }
      );

      return result;
    } catch (error) {
      throw createAppError(
        "Error updating karat status",
        500,
        "BULK_UPDATE_ERROR"
      );
    }
  }
}

export default KaratMasterService;
