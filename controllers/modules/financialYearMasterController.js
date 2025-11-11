
import FinancialYearService from "../../services/modules/FinancialYearService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class FinancialYearController {
  // CREATE
  static createFinancialYear = async (req, res, next) => {
    try {
      const { code, startDate, endDate, voucherReset } = req.body;

      if (!code?.trim()) {
        throw createAppError(
          "Financial year code is required",
          400,
          "REQUIRED_FIELD_MISSING"
        );
      }

      if (!startDate || !endDate) {
        throw createAppError(
          "Start date and end date are required",
          400,
          "REQUIRED_FIELD_MISSING"
        );
      }

      const financialYear = await FinancialYearService.createFinancialYear(
        { code, startDate, endDate, voucherReset },
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Financial year created successfully",
        data: financialYear,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllFinancialYears = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";

      const result = await FinancialYearService.getAllFinancialYears(
        page,
        limit,
        search
      );

      res.status(200).json({
        success: true,
        message: "Financial years retrieved successfully",
        data: result.financialYears,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getFinancialYearById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const financialYear = await FinancialYearService.getFinancialYearById(id);

      res.status(200).json({
        success: true,
        message: "Financial year retrieved successfully",
        data: financialYear,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET CURRENT FINANCIAL YEAR
  static getCurrentFinancialYear = async (req, res, next) => {
    try {
      const financialYear = await FinancialYearService.getCurrentFinancialYear();

      res.status(200).json({
        success: true,
        message: "Current financial year retrieved successfully",
        data: financialYear,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateFinancialYear = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const financialYear = await FinancialYearService.updateFinancialYear(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Financial year updated successfully",
        data: financialYear,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE (Hard Delete)
  static deleteFinancialYear = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await FinancialYearService.deleteFinancialYear(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // SOFT DELETE
  static softDeleteFinancialYear = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await FinancialYearService.softDeleteFinancialYear(
        id,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default FinancialYearController;