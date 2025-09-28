import Color from "../../models/modules/Color.js";
import Size from "../../models/modules/Size.js";
import Brand from "../../models/modules/Brand.js";
import { createAppError } from "../../utils/errorHandler.js";

class ProductMasterService {
  // ==================== COLOR METHODS ====================

  static async createColor(colorData, adminId) {
    try {
      // Check if code already exists within the subcategory
      const codeExists = await Color.isCodeExists(colorData.code);
      if (codeExists) {
        throw createAppError(
          `Color with code '${colorData.code}' already exists `,
          409,
          "DUPLICATE_CODE"
        );
      }

      const color = new Color({
        ...colorData,
        createdBy: adminId,
      });

      await color.save();
      return await Color.findById(color._id).populate(
        "createdBy",
        "name email"
      );
    } catch (error) {
      throw error;
    }
  }

  static async getAllColors(page = 1, limit = 10, search = "", status = "") {
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

      const [colors, total] = await Promise.all([
        Color.find(query)
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Color.countDocuments(query),
      ]);

      return {
        colors,
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

  static async getColorById(id) {
    try {
      const color = await Color.findById(id)
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!color) {
        throw createAppError("Color not found", 404, "NOT_FOUND");
      }

      return color;
    } catch (error) {
      throw error;
    }
  }

  static async updateColor(id, updateData, adminId) {
    try {
      const color = await Color.findById(id);
      if (!color) {
        throw createAppError("Color not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== color.code) {
        const codeExists = await Color.isCodeExists(updateData.code, id);
        if (codeExists) {
          throw createAppError(
            `Color with code '${updateData.code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedColor = await Color.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedColor;
    } catch (error) {
      throw error;
    }
  }

  static async deleteColor(id) {
    try {
      const color = await Color.findById(id);
      if (!color) {
        throw createAppError("Color not found", 404, "NOT_FOUND");
      }

      color.status = "inactive";
      color.isActive = false;
      await color.save();
      return { message: "Color deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== SIZE METHODS ====================

  static async createSize(sizeData, adminId) {
    try {
      // Check if code already exists within the subcategory
      const codeExists = await Size.isCodeExists(sizeData.code);
      if (codeExists) {
        throw createAppError(
          `Size with code '${sizeData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const size = new Size({
        ...sizeData,
        createdBy: adminId,
      });

      await size.save();
      return await Size.findById(size._id).populate("createdBy", "name email");
    } catch (error) {
      throw error;
    }
  }

  static async getAllSizes(
    page = 1,
    limit = 10,
    search = "",
    status = "",
    subCategoryId = ""
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

      const [sizes, total] = await Promise.all([
        Size.find(query)

          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ displayOrder: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Size.countDocuments(query),
      ]);

      return {
        sizes,
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

  static async getSizeById(id) {
    try {
      const size = await Size.findById(id)

        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!size) {
        throw createAppError("Size not found", 404, "NOT_FOUND");
      }

      return size;
    } catch (error) {
      throw error;
    }
  }

  static async updateSize(id, updateData, adminId) {
    try {
      const size = await Size.findById(id);
      if (!size) {
        throw createAppError("Size not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== size.code) {
        const codeExists = await Size.isCodeExists(
          updateData.code,

          id
        );
        if (codeExists) {
          throw createAppError(
            `Size with code '${updateData.code}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedSize = await Size.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )

        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedSize;
    } catch (error) {
      throw error;
    }
  }

  static async deleteSize(id) {
    try {
      const size = await Size.findById(id);
      if (!size) {
        throw createAppError("Size not found", 404, "NOT_FOUND");
      }

      size.status = "inactive";
      size.isActive = false;
      await size.save();
      return { message: "Size deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== BRAND METHODS ====================

  static async createBrand(brandData, adminId) {
    try {
      // Check if code already exists within the subcategory
      const codeExists = await Brand.isCodeExists(brandData.code);
      if (codeExists) {
        throw createAppError(
          `Brand with code '${brandData.code}' already exists`,
          409,
          "DUPLICATE_CODE"
        );
      }

      const brand = new Brand({
        ...brandData,
        createdBy: adminId,
      });

      await brand.save();
      return await Brand.findById(brand._id).populate(
        "createdBy",
        "name email"
      );
    } catch (error) {
      throw error;
    }
  }

  static async getAllBrands(
    page = 1,
    limit = 10,
    search = "",
    status = "",
    subCategoryId = ""
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

      const [brands, total] = await Promise.all([
        Brand.find(query)

          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Brand.countDocuments(query),
      ]);

      return {
        brands,
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

  static async getBrandById(id) {
    try {
      const brand = await Brand.findById(id)

        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      if (!brand) {
        throw createAppError("Brand not found", 404, "NOT_FOUND");
      }

      return brand;
    } catch (error) {
      throw error;
    }
  }

  static async updateBrand(id, updateData, adminId) {
    try {
      const brand = await Brand.findById(id);
      if (!brand) {
        throw createAppError("Brand not found", 404, "NOT_FOUND");
      }

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== brand.code) {
        const codeExists = await Brand.isCodeExists(
          updateData.code,

          id
        );
        if (codeExists) {
          throw createAppError(
            `Brand with code '${updateData.code}' already exists `,
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      const updatedBrand = await Brand.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy: adminId },
        { new: true, runValidators: true }
      )

        .populate("createdBy", "name email")
        .populate("updatedBy", "name email");

      return updatedBrand;
    } catch (error) {
      throw error;
    }
  }

  static async deleteBrand(id) {
    try {
      const brand = await Brand.findById(id);
      if (!brand) {
        throw createAppError("Brand not found", 404, "NOT_FOUND");
      }

      brand.status = "inactive";
      brand.isActive = false;
      await brand.save();
      return { message: "Brand deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  static async getColorsBySubCategory(subCategoryId) {
    try {
      const colors = await Color.find({
        subCategory: subCategoryId,
        status: "active",
      }).select("code description hexCode");

      return colors;
    } catch (error) {
      throw error;
    }
  }

  static async getSizesBySubCategory(subCategoryId) {
    try {
      const sizes = await Size.find({
        subCategory: subCategoryId,
        status: "active",
      })
        .select("code description displayOrder")
        .sort({ displayOrder: 1 });

      return sizes;
    } catch (error) {
      throw error;
    }
  }

  static async getBrandsBySubCategory(subCategoryId) {
    try {
      const brands = await Brand.find({
        subCategory: subCategoryId,
        status: "active",
      }).select("code description logo website");

      return brands;
    } catch (error) {
      throw error;
    }
  }
}

export default ProductMasterService;
