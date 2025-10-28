// src/controllers/ClassificationController.js
import ClassificationService from "../../services/modules/ClassificationService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class ClassificationController {
  // CREATE
  static createClassification = async (req, res, next) => {
    try {
      const { name } = req.body;
        
      if (!name?.trim()) {
        throw createAppError("Classification name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const classification = await ClassificationService.createClassification(
        { name },
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Classification created successfully",
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllClassifications = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";

      const result = await ClassificationService.getAllClassifications(page, limit, search);

      res.status(200).json({
        success: true,
        message: "Classifications retrieved successfully",
        data: result.classifications,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getClassificationById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const classification = await ClassificationService.getClassificationById(id);

      res.status(200).json({
        success: true,
        message: "Classification retrieved successfully",
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateClassification = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const classification = await ClassificationService.updateClassification(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Classification updated successfully",
        data: classification,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteClassification = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await ClassificationService.deleteClassification(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default ClassificationController;