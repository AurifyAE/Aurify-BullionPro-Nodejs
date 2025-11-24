// src/services/DocumentTypeService.js
import DocumentType from "../../models/modules/DocumentType.js";
import { createAppError } from "../../utils/errorHandler.js";

export class DocumentTypeService {
  // CREATE
  static async createDocumentType(documentTypeData, adminId) {
    try {
      const { name, status, validationProperties } = documentTypeData;

      if (!name?.trim()) {
        throw createAppError("Document type name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      // Check duplicate name
      const nameExists = await DocumentType.isNameExists(name.trim());
      if (nameExists) {
        throw createAppError(`Document type with name '${name}' already exists`, 409, "DUPLICATE_NAME");
      }

      // Validate validation properties if provided
      if (validationProperties) {
        if (validationProperties.minLength && validationProperties.maxLength) {
          if (validationProperties.minLength > validationProperties.maxLength) {
            throw createAppError("minLength cannot be greater than maxLength", 400, "INVALID_VALIDATION");
          }
        }
      }

      const documentType = new DocumentType({
        name: name.trim(),
        status: status !== undefined ? status : true,
        validationProperties: validationProperties || {
          minLength: null,
          maxLength: null,
         
        },
        createdBy: adminId,
      });

      await documentType.save();

      return await DocumentType.findById(documentType._id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  // READ ALL
  static async getAllDocumentTypes(page = 1, limit = 10, search = "", status = null) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      // Filter by status if provided
      if (status !== null) {
        query.status = status === "true" || status === true;
      }

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { name: new RegExp(search, "i") },
        ];
      }

      const [documentTypes, total] = await Promise.all([
        DocumentType.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        DocumentType.countDocuments(query),
      ]);

      return {
        documentTypes,
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
  static async getDocumentTypeById(id) {
    try {
      const documentType = await DocumentType.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!documentType) {
        throw createAppError("Document type not found", 404, "NOT_FOUND");
      }

      return documentType;
    } catch (error) {
      throw error;
    }
  }

  // UPDATE
  static async updateDocumentType(id, updateData, adminId) {
    try {
      const documentType = await DocumentType.findById(id);
      if (!documentType) {
        throw createAppError("Document type not found", 404, "NOT_FOUND");
      }

      const { name, status, validationProperties } = updateData;

      if (name && name.trim() !== documentType.name) {
        const nameExists = await DocumentType.isNameExists(name.trim(), id);
        if (nameExists) {
          throw createAppError(`Document type with name '${name}' already exists`, 409, "DUPLICATE_NAME");
        }
      }

      // Validate validation properties if provided
      if (validationProperties) {
        if (validationProperties.minLength && validationProperties.maxLength) {
          if (validationProperties.minLength > validationProperties.maxLength) {
            throw createAppError("minLength cannot be greater than maxLength", 400, "INVALID_VALIDATION");
          }
        }
      }

      const updateFields = {
        updatedBy: adminId,
      };

      if (name) updateFields.name = name.trim();
      if (status !== undefined) updateFields.status = status;
      if (validationProperties) {
        updateFields.validationProperties = {
          ...documentType.validationProperties,
          ...validationProperties,
        };
      }

      const updatedDocumentType = await DocumentType.findByIdAndUpdate(
        id,
        updateFields,
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedDocumentType;
    } catch (error) {
      throw error;
    }
  }

  // DELETE (Hard Delete)
  static async deleteDocumentType(id) {
    try {
      const documentType = await DocumentType.findById(id);
      if (!documentType) {
        throw createAppError("Document type not found", 404, "NOT_FOUND");
      }

      await DocumentType.deleteOne({ _id: id });
      return { message: "Document type deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}

export default DocumentTypeService;

