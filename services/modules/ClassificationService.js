// src/services/ClassificationService.js
import Classification from "../../models/modules/Classification.js";
import { createAppError } from "../../utils/errorHandler.js";

export class ClassificationService {
  // CREATE
  static async createClassification(classificationData, adminId) {
    try {
      const { name } = classificationData;

      if (!name?.trim()) {
        throw createAppError("Classification name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      // Check duplicate name
      const nameExists = await Classification.isNameExists(name.trim());
      if (nameExists) {
        throw createAppError(`Classification with name '${name}' already exists`, 409, "DUPLICATE_NAME");
      }

      const classification = new Classification({
        name: name.trim(),
        createdBy: adminId,
      });

      await classification.save();

      return await Classification.findById(classification._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // READ ALL
  static async getAllClassifications(page = 1, limit = 10, search = "") {
    try {
      const skip = (page - 1) * limit;
      const query = { status: true }; // Only active

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { name: new RegExp(search, "i") },
        ];
      }

      const [classifications, total] = await Promise.all([
        Classification.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Classification.countDocuments(query),
      ]);

      return {
        classifications,
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
  static async getClassificationById(id) {
    try {
      const classification = await Classification.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!classification) {
        throw createAppError("Classification not found", 404, "NOT_FOUND");
      }

      if (!classification.status) {
        throw createAppError("Classification is inactive", 410, "INACTIVE");
      }

      return classification;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateClassification(id, updateData, adminId) {
    try {
      const classification = await Classification.findById(id);
      if (!classification) {
        throw createAppError("Classification not found", 404, "NOT_FOUND");
      }

      const { name } = updateData;

      if (name && name.trim() !== classification.name) {
        const nameExists = await Classification.isNameExists(name.trim(), id);
        if (nameExists) {
          throw createAppError(`Classification with name '${name}' already exists`, 409, "DUPLICATE_NAME");
        }
      }

      const updatedClassification = await Classification.findByIdAndUpdate(
        id,
        {
          ...(name && { name: name.trim() }),
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedClassification;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (Hard Delete)
  static async deleteClassification(id) {
    try {
      const classification = await Classification.findById(id);
      if (!classification) {
        throw createAppError("Classification not found", 404, "NOT_FOUND");
      }

      await Classification.deleteOne({ _id: id });
      return { message: "Classification deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}

export default ClassificationService;