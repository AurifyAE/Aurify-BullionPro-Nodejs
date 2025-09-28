import ProductMasterService from "../../services/modules/ProductMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

class ProductMasterController {
  // ==================== COLOR CONTROLLERS ====================

  static createColor = async (req, res, next) => {
    try {
      const { code, description } = req.body;

      // Validation
      if (!code || !description) {
        throw createAppError(
          "All fields are required: code, description",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      const colorData = {
        code: code.trim(),
        description: description.trim(),
      };

      const color = await ProductMasterService.createColor(
        colorData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Color created successfully",
        data: color,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllColors = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const status = req.query.status || "";

      const result = await ProductMasterService.getAllColors(
        page,
        limit,
        search,
        status
      );

      res.status(200).json({
        success: true,
        message: "Colors retrieved successfully",
        data: result.colors,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getColorById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const color = await ProductMasterService.getColorById(id);

      res.status(200).json({
        success: true,
        message: "Color retrieved successfully",
        data: color,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateColor = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const color = await ProductMasterService.updateColor(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Color updated successfully",
        data: color,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteColor = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await ProductMasterService.deleteColor(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== SIZE CONTROLLERS ====================

  static createSize = async (req, res, next) => {
    try {
      const { code, description } = req.body;

      // Validation
      if (!code || !description) {
        throw createAppError(
          "All fields are required: code, description",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      const sizeData = {
        code: code.trim(),
        description: description.trim(),
      };

      const size = await ProductMasterService.createSize(
        sizeData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Size created successfully",
        data: size,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllSizes = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const status = req.query.status || "";

      const result = await ProductMasterService.getAllSizes(
        page,
        limit,
        search,
        status
      );

      res.status(200).json({
        success: true,
        message: "Sizes retrieved successfully",
        data: result.sizes,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getSizeById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const size = await ProductMasterService.getSizeById(id);

      res.status(200).json({
        success: true,
        message: "Size retrieved successfully",
        data: size,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateSize = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const size = await ProductMasterService.updateSize(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Size updated successfully",
        data: size,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteSize = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await ProductMasterService.deleteSize(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== BRAND CONTROLLERS ====================

  static createBrand = async (req, res, next) => {
    try {
      const { code, description } = req.body;

      // Validation
      if (!code || !description ) {
        throw createAppError(
          "All fields are required: code, description, subCategory",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      const brandData = {
        code: code.trim(),
        description: description.trim(),
       
      };

      const brand = await ProductMasterService.createBrand(
        brandData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Brand created successfully",
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllBrands = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || "";
      const status = req.query.status || "";
     

      const result = await ProductMasterService.getAllBrands(
        page,
        limit,
        search,
        status,
   
      );

      res.status(200).json({
        success: true,
        message: "Brands retrieved successfully",
        data: result.brands,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getBrandById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const brand = await ProductMasterService.getBrandById(id);

      res.status(200).json({
        success: true,
        message: "Brand retrieved successfully",
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateBrand = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const brand = await ProductMasterService.updateBrand(
        id,
        updateData,
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: "Brand updated successfully",
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteBrand = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await ProductMasterService.deleteBrand(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== STATUS TOGGLE CONTROLLERS ====================

  static toggleColorStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive"].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const color = await ProductMasterService.updateColor(
        id,
        { status, isActive: status === "active" },
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Color ${
          status === "active" ? "activated" : "deactivated"
        } successfully`,
        data: color,
      });
    } catch (error) {
      next(error);
    }
  };

  static toggleSizeStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive"].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const size = await ProductMasterService.updateSize(
        id,
        { status, isActive: status === "active" },
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Size ${
          status === "active" ? "activated" : "deactivated"
        } successfully`,
        data: size,
      });
    } catch (error) {
      next(error);
    }
  };

  static toggleBrandStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["active", "inactive"].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const brand = await ProductMasterService.updateBrand(
        id,
        { status, isActive: status === "active" },
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Brand ${
          status === "active" ? "activated" : "deactivated"
        } successfully`,
        data: brand,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default ProductMasterController;
