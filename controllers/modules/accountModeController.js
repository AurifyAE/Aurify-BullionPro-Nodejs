import AccountModeService from "../../services/modules/AccountModeService.js";
import { createAppError } from "../../utils/errorHandler.js";

export class AccountModeController {
  // CREATE
  static createAccountMode = async (req, res, next) => {
    try {
      const { name, prefix } = req.body;
        
      if (!name?.trim()) {
        throw createAppError("Account mode name is required", 400, "REQUIRED_FIELD_MISSING");
      }

      if (!prefix?.trim()) {
        throw createAppError("Prefix is required", 400, "REQUIRED_FIELD_MISSING");
      }

      const accountMode = await AccountModeService.createAccountMode(
        { name, prefix },
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Account mode created successfully",
        data: accountMode,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET ALL
  static getAllAccountModes = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";

      const result = await AccountModeService.getAllAccountModes(page, limit, search);

      res.status(200).json({
        success: true,
        message: "Account modes retrieved successfully",
        data: result.accountModes,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  // GET BY ID
  static getAccountModeById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const accountMode = await AccountModeService.getAccountModeById(id);

      res.status(200).json({
        success: true,
        message: "Account mode retrieved successfully",
        data: accountMode,
      });
    } catch (error) {
      next(error);
    }
  };

  // UPDATE
  static updateAccountMode = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const accountMode = await AccountModeService.updateAccountMode(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Account mode updated successfully",
        data: accountMode,
      });
    } catch (error) {
      next(error);
    }
  };

  // DELETE
  static deleteAccountMode = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await AccountModeService.deleteAccountMode(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default AccountModeController;