import BranchMasterService from "../../services/modules/BranchMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

class BranchMasterController {
  
  static createBranch = async (req, res, next) => {
    try {
      const payload = { ...req.body };

      if (req.fileInfo) {
        payload.logo = {
          url: req.fileInfo.location || req.fileInfo.path,
          key: req.fileInfo.filename,
        };
      }

      const branch = await BranchMasterService.createBranch(payload, req.admin.id);

      res.status(201).json({
        success: true,
        message: "Branch created successfully",
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllBranches = async (req, res, next) => {
    try {
      const { page = 1, limit = 10, search = "", status = "" } = req.query;

      const result = await BranchMasterService.getAllBranches(
        +page,
        +limit,
        search,
        status
      );

      res.status(200).json({
        success: true,
        message: "Branches retrieved successfully",
        data: result.branches,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getBranchById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const branch = await BranchMasterService.getBranchById(id);

      res.status(200).json({
        success: true,
        message: "Branch retrieved successfully",
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateBranch = async (req, res, next) => {
    try {
      const { id } = req.params;
      const payload = { ...req.body };

      if (req.fileInfo) {
        payload.logo = {
          url: req.fileInfo.location || req.fileInfo.path,
          key: req.fileInfo.filename,
        };
      }

      const branch = await BranchMasterService.updateBranch(id, payload, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Branch updated successfully",
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteBranch = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await BranchMasterService.deleteBranch(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  static toggleBranchStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive"].includes(status)) {
        throw createAppError("Valid status required: active or inactive", 400, "INVALID_STATUS");
      }

      const branch = await BranchMasterService.updateBranch(
        id,
        { status, isActive: status === "active" },
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Branch ${status === "active" ? "activated" : "deactivated"} successfully`,
        data: branch,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default BranchMasterController;