import OtherChargesService from "../../services/modules/OtherChargesService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class OtherChargesController {
  // CREATE
  static createOtherCharge = async (req, res, next) => {
    try {
      const { description, code } = req.body;
        
      if (!description?.trim()) {
        throw createAppError("Charge description is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const charge = await OtherChargesService.createOtherCharge(
        { description, code },
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Other charge created successfully",
        data: charge,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllOtherCharges = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";

      const result = await OtherChargesService.getAllOtherCharges(page, limit, search);

      res.status(200).json({
        success: true,
        message: "Other charges retrieved successfully",
        data: result.charges,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getOtherChargeById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const charge = await OtherChargesService.getOtherChargeById(id);

      res.status(200).json({
        success: true,
        message: "Other charge retrieved successfully",
        data: charge,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateOtherCharge = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const charge = await OtherChargesService.updateOtherCharge(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Other charge updated successfully",
        data: charge,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteOtherCharge = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await OtherChargesService.deleteOtherCharge(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default OtherChargesController;