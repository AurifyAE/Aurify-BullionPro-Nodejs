import MainCategory from "../../models/modules/MainCategory.js";
import SubCategory from "../../models/modules/SubCategory.js";
import Type from "../../models/modules/Type.js";
import { createAppError } from "../../utils/errorHandler.js";

class CategoryMasterService {
  // ==================== MAIN CATEGORY METHODS ====================

  static async createMainCategory(mainCategoryData, adminId) {
    try {
      // Check if code already exists
      const codeExists = await MainCategory.isCodeExists(mainCategoryData.code);
      if (codeExists) {
        throw createAppError(
          `Main Category with code '${mainCategoryData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const mainCategory = new MainCategory({
        ...mainCategoryData,
        createdBy: adminId,
      });

      await mainCategory.save();
      return await MainCategory.findById(mainCategory._id).populate(
        "createdBy",
        "name email"
      );
    } catch (error) {
      throw error;
    }
  }

  static async getAllMainCategories(
    page = 1,
    limit = 10,
    search = "",
    status = ""
  ) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { description: new RegExp(search, "i") },
        ];
      }

      if (status) {
        query.status = status;
      }

      const [mainCategories, total] = await Promise.all([
        MainCategory.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        MainCategory.countDocuments(query),
      ]);

      return {
        mainCategories,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  static async getMainCategoryById(id) {
    try {
      const mainCategory = await MainCategory.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!mainCategory) {
        throw createAppError("Main Category not found", 404, "NOT_FOUND");
      }

      return mainCategory;
    } catch (error) {
      throw error;
    }
  }

  static async updateMainCategory(id, updateData, adminId) {
    try {
      const mainCategory = await MainCategory.findById(id);
      if (!mainCategory) {
        throw createAppError("Main Category not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== mainCategory.code) {
        const codeExists = await MainCategory.isCodeExists(updateData.code, id);
        if (codeExists) {
          throw createAppError(
            `Main Category with code '${updateData.code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedMainCategory = await MainCategory.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedMainCategory;
    } catch (error) {
      throw error;
    }
  }

  static async deleteMainCategory(id) {
    try {
      // Check if main category exists
      const mainCategory = await MainCategory.findById(id);
      if (!mainCategory) {
        throw createAppError("Main Category not found", 404, "NOT_FOUND");
      }
      mainCategory.status = "inactive";
      mainCategory.isActive = false;
      await mainCategory.save();

      return { message: "Main Category deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== SUB CATEGORY METHODS ====================

  static async createSubCategory(subCategoryData, adminId) {
    try {
      // Check if code already exists within the main category
      const codeExists = await SubCategory.isCodeExists(subCategoryData.code);
      if (codeExists) {
        throw createAppError(
          `Sub Category with code '${subCategoryData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const subCategory = new SubCategory({
        ...subCategoryData,
        createdBy: adminId,
      });

      await subCategory.save();
      return await SubCategory.findById(subCategory._id).populate(
        "createdBy",
        "name email"
      );
    } catch (error) {
      throw error;
    }
  }

  static async getAllSubCategories(
    page = 1,
    limit = 10,
    search = "",
    status = ""
  ) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { description: new RegExp(search, "i") },
        ];
      }

      if (status) {
        query.status = status;
      }

      const [subCategories, total] = await Promise.all([
        SubCategory.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        SubCategory.countDocuments(query),
      ]);

      return {
        subCategories,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  static async getSubCategoryById(id) {
    try {
      const subCategory = await SubCategory.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!subCategory) {
        throw createAppError("Sub Category not found", 404, "NOT_FOUND");
      }

      return subCategory;
    } catch (error) {
      throw error;
    }
  }

  static async updateSubCategory(id, updateData, adminId) {
    try {
      const subCategory = await SubCategory.findById(id);
      if (!subCategory) {
        throw createAppError("Sub Category not found", 404, "NOT_FOUND");
      }

      if (updateData.code && updateData.code !== subCategory.code) {
        const codeExists = await SubCategory.isCodeExists(updateData.code, id);
        if (codeExists) {
          throw createAppError(
            `Sub Category with code '${updateData.code}' already exists `,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedSubCategory = await SubCategory.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedSubCategory;
    } catch (error) {
      throw error;
    }
  }

  static async deleteSubCategory(id) {
    try {
      // Check if sub category exists
      const subCategory = await SubCategory.findById(id);
      if (!subCategory) {
        throw createAppError("Sub Category not found", 404, "NOT_FOUND");
      }

      subCategory.status = "inactive";
      subCategory.isActive = false;
      await subCategory.save();
      return { message: "Sub Category deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== TYPE METHODS ====================

  static async createType(typeData, adminId) {
    try {
      const codeExists = await Type.isCodeExists(typeData.code);
      if (codeExists) {
        throw createAppError(
          `Type with code '${typeData.code}' already exists in this Sub Category`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const type = new Type({
        ...typeData,
        createdBy: adminId,
      });

      await type.save();
      return await Type.findById(type._id).populate("createdBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  static async getAllTypes(page = 1, limit = 10, search = "", status = "") {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (search) {
        query.$or = [
          { code: new RegExp(search, "i") },
          { description: new RegExp(search, "i") },
        ];
      }

      if (status) {
        query.status = status;
      }

      const [types, total] = await Promise.all([
        Type.find(query)

          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Type.countDocuments(query),
      ]);

      return {
        types,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  static async getTypeById(id) {
    try {
      const type = await Type.findById(id)

        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!type) {
        throw createAppError("Type not found", 404, "NOT_FOUND");
      }

      return type;
    } catch (error) {
      throw error;
    }
  }

  static async updateType(id, updateData, adminId) {
    try {
      const type = await Type.findById(id);
      if (!type) {
        throw createAppError("Type not found", 404, "NOT_FOUND");
      }

      if (updateData.code && updateData.code !== type.code) {
        const codeExists = await Type.isCodeExists(updateData.code, id);
        if (codeExists) {
          throw createAppError(
            `Type with code '${updateData.code}' already exists in this Sub Category`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedType = await Type.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedType;
    } catch (error) {
      throw error;
    }
  }

  static async deleteType(id) {
    try {
      const type = await Type.findById(id);
      if (!type) {
        throw createAppError("Type not found", 404, "NOT_FOUND");
      }

      type.status = "inactive";
      type.isActive = false;
      await type.save();
      return { message: "Type deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  static async getSubCategoriesByMainCategory(mainCategoryId) {
    try {
      const subCategories = await SubCategory.find({
        mainCategory: mainCategoryId,
        status: "active",
      }).select("code description");

      return subCategories;
    } catch (error) {
      throw error;
    }
  }

  static async getTypesBySubCategory(subCategoryId) {
    try {
      const types = await Type.find({
        subCategory: subCategoryId,
        status: "active",
      }).select("code description");

      return types;
    } catch (error) {
      throw error;
    }
  }
}

export default CategoryMasterService;
