import CategoryMasterService from "../../services/modules/CategoryMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

class CategoryMasterController {
  
  // ==================== MAIN CATEGORY CONTROLLERS ====================
  
  static createMainCategory = async (req, res, next) => {
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

      const mainCategoryData = {
        code: code.trim(),
        description: description.trim(),
      };

      const mainCategory = await CategoryMasterService.createMainCategory(
        mainCategoryData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Main Category created successfully",
        data: mainCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllMainCategories = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || '';
      const status = req.query.status || '';

      const result = await CategoryMasterService.getAllMainCategories(page, limit, search, status);

      res.status(200).json({
        success: true,
        message: "Main Categories retrieved successfully",
        data: result.mainCategories,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getMainCategoryById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const mainCategory = await CategoryMasterService.getMainCategoryById(id);

      res.status(200).json({
        success: true,
        message: "Main Category retrieved successfully",
        data: mainCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateMainCategory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const mainCategory = await CategoryMasterService.updateMainCategory(id, updateData, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Main Category updated successfully",
        data: mainCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteMainCategory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await CategoryMasterService.deleteMainCategory(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== SUB CATEGORY CONTROLLERS ====================
  
  static createSubCategory = async (req, res, next) => {
    try {
      const { code, description } = req.body;

      // Validation
      if (!code || !description ) {
        throw createAppError(
          "All fields are required: code, description",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

      const subCategoryData = {
        code: code.trim(),
        description: description.trim(),
      };

      const subCategory = await CategoryMasterService.createSubCategory(
        subCategoryData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Sub Category created successfully",
        data: subCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllSubCategories = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || '';
      const status = req.query.status || '';
  

      const result = await CategoryMasterService.getAllSubCategories(
        page, limit, search, status
      );

      res.status(200).json({
        success: true,
        message: "Sub Categories retrieved successfully",
        data: result.subCategories,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getSubCategoryById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const subCategory = await CategoryMasterService.getSubCategoryById(id);

      res.status(200).json({
        success: true,
        message: "Sub Category retrieved successfully",
        data: subCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateSubCategory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const subCategory = await CategoryMasterService.updateSubCategory(id, updateData, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Sub Category updated successfully",
        data: subCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteSubCategory = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await CategoryMasterService.deleteSubCategory(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };

  // ==================== TYPE CONTROLLERS ====================
  
  static createType = async (req, res, next) => {
    try {
      const { code, description  } = req.body;

      // Validation
      if (!code || !description) {
        throw createAppError(
          "All fields are required: code, description",
          400,
          "REQUIRED_FIELDS_MISSING"
        );
      }

     const typeData = {
        code: code.trim(),
        description: description.trim()
      };

      const type = await CategoryMasterService.createType(
        typeData,
        req.admin.id
      );

      res.status(201).json({
        success: true,
        message: "Type created successfully",
        data: type,
      });
    } catch (error) {
      next(error);
    }
  };

  static getAllTypes = async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || '';
      const status = req.query.status || '';
      const mainCategoryId = req.query.mainCategory || '';
      const subCategoryId = req.query.subCategory || '';

      const result = await CategoryMasterService.getAllTypes(
        page, limit, search, status, mainCategoryId, subCategoryId
      );

      res.status(200).json({
        success: true,
        message: "Types retrieved successfully",
        data: result.types,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  static getTypeById = async (req, res, next) => {
    try {
      const { id } = req.params;
      const type = await CategoryMasterService.getTypeById(id);

      res.status(200).json({
        success: true,
        message: "Type retrieved successfully",
        data: type,
      });
    } catch (error) {
      next(error);
    }
  };

  static updateType = async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const type = await CategoryMasterService.updateType(id, updateData, req.admin.id);

      res.status(200).json({
        success: true,
        message: "Type updated successfully",
        data: type,
      });
    } catch (error) {
      next(error);
    }
  };

  static deleteType = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await CategoryMasterService.deleteType(id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };


  // ==================== BULK OPERATIONS ====================
  
  static toggleMainCategoryStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['active', 'inactive'].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const mainCategory = await CategoryMasterService.updateMainCategory(
        id, 
        { status, isActive: status === 'active' }, 
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Main Category ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
        data: mainCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static toggleSubCategoryStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['active', 'inactive'].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const subCategory = await CategoryMasterService.updateSubCategory(
        id, 
        { status, isActive: status === 'active' }, 
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Sub Category ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
        data: subCategory,
      });
    } catch (error) {
      next(error);
    }
  };

  static toggleTypeStatus = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['active', 'inactive'].includes(status)) {
        throw createAppError(
          "Valid status is required: active or inactive",
          400,
          "INVALID_STATUS"
        );
      }

      const type = await CategoryMasterService.updateType(
        id, 
        { status, isActive: status === 'active' }, 
        req.admin.id
      );

      res.status(200).json({
        success: true,
        message: `Type ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
        data: type,
      });
    } catch (error) {
      next(error);
    }
  };


}

export default CategoryMasterController;