// src/controllers/DocumentTypeController.js
import DocumentTypeService from "../../services/modules/DocumentTypeService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class DocumentTypeController {
  // CREATE
  static createDocumentType = async (req, res, next) => {
    try {
      const { name, status, validationProperties } = req.body;
        
      if (!name?.trim()) {
        throw createAppError("Document type name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const documentType = await DocumentTypeService.createDocumentType(
        { name, status, validationProperties },
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Document type created successfully",
        data: documentType,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllDocumentTypes = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const status = req.query.status;

      const result = await DocumentTypeService.getAllDocumentTypes(page, limit, search, status);

      res.status(200).json({
        success: true,
        message: "Document types retrieved successfully",
        data: result.documentTypes,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getDocumentTypeById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const documentType = await DocumentTypeService.getDocumentTypeById(id);

      res.status(200).json({
        success: true,
        message: "Document type retrieved successfully",
        data: documentType,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateDocumentType = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const documentType = await DocumentTypeService.updateDocumentType(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Document type updated successfully",
        data: documentType,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteDocumentType = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await DocumentTypeService.deleteDocumentType(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default DocumentTypeController;

