import OtherCharges from "../../models/modules/OtherCharges.js";
import { createAppError } from "../../utils/errorHandler.js";

export class OtherChargesService {
  // CREATE
  static async createOtherCharge(chargeData, adminId) {
    try {
      const { description, code } = chargeData;

      if (!description?.trim()) {
        throw createAppError("Charge description is required", 400, "REQUIRED_FIELD_MISSING");
      }

      // Check duplicate description
      const descriptionExists = await OtherCharges.isDescriptionExists(description.trim());
      if (descriptionExists) {
        throw createAppError(`Other charge with description '${description}' already exists`, 409, "DUPLICATE_DESCRIPTION");
      }

      // Check duplicate code (if provided from frontend)
      if (code) {
        const codeExists = await OtherCharges.findOne({ code: code.trim().toUpperCase() });
        if (codeExists) {
          throw createAppError(`Other charge with code '${code}' already exists`, 409, "DUPLICATE_CODE");
        }
      }

      const otherCharge = new OtherCharges({
        description: description.trim(),
        code: code?.trim().toUpperCase(), // Use frontend code or let pre-save generate it
        createdBy: adminId,
      });

      await otherCharge.save();

      return await OtherCharges.findById(otherCharge._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // READ ALL
  static async getAllOtherCharges(page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = { status: true }; // Only active

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { description: new RegExp(search, "i") },
        ];
      }

      const [charges, total] = await Promise.all([
        OtherCharges.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        OtherCharges.countDocuments(query),
      ]);

      return {
        charges,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // READ BY ID
  static async getOtherChargeById(id) {
    try {
      const charge = await OtherCharges.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!charge) {
        throw createAppError("Other charge not found", 404, "NOT_FOUND");
      }

      if (!charge.status) {
        throw createAppError("Other charge is inactive", 410, "INACTIVE");
      }

      return charge;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateOtherCharge(id, updateData, adminId) {
    try {
      const charge = await OtherCharges.findById(id);
      if (!charge) {
        throw createAppError("Other charge not found", 404, "NOT_FOUND");
      }

      const { description, code } = updateData;

      // Check duplicate description (if changed)
      if (description && description.trim() !== charge.description) {
        const descriptionExists = await OtherCharges.isDescriptionExists(description.trim(), id);
        if (descriptionExists) {
          throw createAppError(`Other charge with description '${description}' already exists`, 409, "DUPLICATE_DESCRIPTION");
        }
      }

      // Check duplicate code (if changed)
      if (code && code.trim().toUpperCase() !== charge.code) {
        const codeExists = await OtherCharges.findOne({ 
          code: code.trim().toUpperCase(),
          _id: { $ne: id }
        });
        if (codeExists) {
          throw createAppError(`Other charge with code '${code}' already exists`, 409, "DUPLICATE_CODE");
        }
      }

      const updatedCharge = await OtherCharges.findByIdAndUpdate(
        id,
        {
          ...(description && { description: description.trim() }),
          ...(code && { code: code.trim().toUpperCase() }),
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedCharge;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (Hard Delete)
  static async deleteOtherCharge(id) {
    try {
      const charge = await OtherCharges.findById(id);
      if (!charge) {
        throw createAppError("Other charge not found", 404, "NOT_FOUND");
      }

      await OtherCharges.deleteOne({ _id: id });
      return { message: "Other charge deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}

export default OtherChargesService;