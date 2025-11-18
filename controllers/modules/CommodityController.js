import CommodityService from "../../services/modules/CommodityService.js";
import { createAppError } from "../../utils/errorHandler.js";

export default class CommodityController {
  // CREATE
  static createCommodity = async (req, res, next) => {
    try {
      const commodity = await CommodityService.createCommodity(req.body, req.admin.id);
      res.status(201).json({ success: true, message: "Commodity created successfully", data: commodity });
    } catch (error) {
      next(error);
    }
  };

  // LIST
  static getAllCommodities = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const result = await CommodityService.listCommodities(page, limit, search);
      res.status(200).json({ success: true, message: "Commodities retrieved successfully", data: result.items, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getCommodityById = async (req, res, next) => {
    try {
      const item = await CommodityService.getCommodityById(req.params.id);
      res.status(200).json({ success: true, message: "Commodity retrieved successfully", data: item });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateCommodity = async (req, res, next) => {
    try {
      const item = await CommodityService.updateCommodity(req.params.id, req.body, req.admin.id);
      res.status(200).json({ success: true, message: "Commodity updated successfully", data: item });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteCommodity = async (req, res, next) => {
    try {
      await CommodityService.deleteCommodity(req.params.id);
      res.status(200).json({ success: true, message: "Commodity deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}


