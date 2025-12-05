// src/controllers/SalesmanController.js
import SalesmanService from "../../services/modules/SalesManService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class SalesmanController {
  // CREATE
  static createSalesman = async (req, res, next) => {
    try {
      const { name } = req.body;

      if (!name?.trim()) {
        throw createAppError("Salesman name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const salesman = await SalesmanService.createSalesman(req.body, req.admin.id);

      res.status(201).json({
        success: true,
        message: "Salesman created successfully",
        data: salesman,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllSalesmen = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const status = req.query.status || "";

      const result = await SalesmanService.getAllSalesmen(page, limit, search, status);

      res.status(200).json({
        success: true,
        message: "Salesmen retrieved successfully",
        data: result.salesmen,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getSalesmanById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const salesman = await SalesmanService.getSalesmanById(id);

      res.status(200).json({
        success: true,
        message: "Salesman retrieved successfully",
        data: salesman,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateSalesman = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!name?.trim()) {
        throw createAppError("Salesman name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const salesman = await SalesmanService.updateSalesman(id, req.body, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Salesman updated successfully",
        data: salesman,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteSalesman = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await SalesmanService.deleteSalesman(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateSalesmanStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (typeof status !== "boolean") {
        throw createAppError("Status must be boolean", 400, "INVALID_STATUS");
      }

      const salesman = await SalesmanService.updateSalesmanStatus(id, status, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Salesman status updated successfully",
        data: salesman,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default SalesmanController;