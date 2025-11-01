import MetalStock from "../../models/modules/MetalStock.js";
import Registry from "../../models/modules/Registry.js";
import { createAppError } from "../../utils/errorHandler.js";
import InventoryService from "./inventoryService.js";


class MetalStockService {
  // Helper method to create Registry entries for stock operations
  static async createRegistryEntries(metalStock, operation, adminId, previousValues = null) {
    try {
      const registryEntries = [];
      
      // Get the populated metal stock data
      const populatedMetalStock = await MetalStock.findById(metalStock._id).populate([
        { path: "karat", select: "standardPurity karatCode" },
        { path: "costCenter", select: "code" },
        { path: "metalType", select: "code description" }
      ]);

      if (!populatedMetalStock) {
        throw new Error("Metal stock not found for registry creation");
      }

      const standardPurity = populatedMetalStock.karat?.standardPurity || 0;
      
      // Check if standard purity is valid (> 0)
      if (standardPurity <= 0) {
        console.warn(`Skipping registry creation - Invalid standard purity: ${standardPurity} for stock: ${populatedMetalStock.code}`);
        return [];
      }

      const costCenterCode = populatedMetalStock.costCenter?.code || "DEFAULT";
      
      // Calculate values based on operation type
      let stockValue = 0;
      let goldValue = 0;
      let description = "";

      if (populatedMetalStock.pcs) {
        // For piece-based stock (pcs: true)
        if (populatedMetalStock.totalValue <= 0) {
          return [];
        }

        switch (operation) {
          case "CREATE":
            stockValue = populatedMetalStock.totalValue;
            goldValue = populatedMetalStock.totalValue * (standardPurity / 100);
            description = `Stock created: ${populatedMetalStock.code} (Pieces)`;
            break;

          case "UPDATE":
            const oldStockValue = previousValues?.totalValue || 0;
            const oldGoldValue = oldStockValue * (standardPurity / 100);
            
            stockValue = populatedMetalStock.totalValue - oldStockValue;
            goldValue = (populatedMetalStock.totalValue * (standardPurity / 100)) - oldGoldValue;
            description = `Stock updated: ${populatedMetalStock.code} (Pieces)`;
            break;

          case "DELETE":
            stockValue = -populatedMetalStock.totalValue;
            goldValue = -(populatedMetalStock.totalValue * (standardPurity / 100));
            description = `Stock deleted: ${populatedMetalStock.code} (Pieces)`;
            break;

          default:
            throw new Error("Invalid registry operation type");
        }
      } else {
        // For weight-based stock (pcs: false)
        // Store only the standardPurity value
        switch (operation) {
          case "CREATE":
            stockValue = standardPurity;
            goldValue = standardPurity; // Store same value for both entries
            description = `Stock created: ${populatedMetalStock.code} (Weight-based)`;
            break;

          case "UPDATE":
            const oldPurity = previousValues?.standardPurity || 0;
            stockValue = standardPurity - oldPurity;
            goldValue = standardPurity - oldPurity;
            description = `Stock updated: ${populatedMetalStock.code} (Weight-based)`;
            break;

          case "DELETE":
            stockValue = -standardPurity;
            goldValue = -standardPurity;
            description = `Stock deleted: ${populatedMetalStock.code} (Weight-based)`;
            break;

          default:
            throw new Error("Invalid registry operation type");
        }
      }

      // Generate transaction IDs for both entries
      const stockTransactionId = await Registry.generateTransactionId();
      const goldTransactionId = await Registry.generateTransactionId();

      // Create Stock Balance Registry Entry
      if (stockValue !== 0) {
        const stockRegistry = new Registry({
          transactionId: stockTransactionId,
          costCenter: costCenterCode,
          type: "STOCK_BALANCE",
          description: `${description} - Stock Value`,
          value: Math.abs(stockValue),
          debit: stockValue > 0 ? stockValue : 0,
          credit: stockValue < 0 ? Math.abs(stockValue) : 0,
          reference: populatedMetalStock.code,
          createdBy: adminId,
        });

        registryEntries.push(stockRegistry);
      }

      // Create Gold Registry Entry
      if (goldValue !== 0) {
        const goldRegistry = new Registry({
          transactionId: goldTransactionId,
          costCenter: costCenterCode,
          type: "GOLD",
          description: `${description} - Gold Value (${standardPurity}%)`,
          value: Math.abs(goldValue),
          debit: goldValue > 0 ? goldValue : 0,
          credit: goldValue < 0 ? Math.abs(goldValue) : 0,
          reference: populatedMetalStock.code,
          createdBy: adminId,
        });

        registryEntries.push(goldRegistry);
      }

      // Save all registry entries
      if (registryEntries.length > 0) {
        await Promise.all(registryEntries.map(entry => entry.save()));
      }

      return registryEntries;
    } catch (error) {
      console.error("Error creating registry entries:", error);
      throw createAppError(
        "Error creating registry entries",
        500,
        "CREATE_REGISTRY_ERROR"
      );
    }
  }

  // Create new metal stock
  static async createMetalStock(metalStockData, adminId) {
    try {
      // Check if code already exists
      const codeExists = await MetalStock.isCodeExists(metalStockData.code);
      if (codeExists) {
        throw createAppError(
          "Metal stock code already exists",
          409,
          "DUPLICATE_CODE"
        );
      }

      // Create new metal stock
      const metalStock = new MetalStock({
        ...metalStockData,
        createdBy: adminId,
      });

      await metalStock.save();

      // Create Registry entries for stock creation
      // await this.createRegistryEntries(metalStock, "CREATE", adminId);

      // Populate the referenced fields
      await metalStock.populate([
        { path: "metalType", select: "code description" },
        { path: "branch", select: "name code" },
        { path: "karat", select: "name value standardPurity" },
        { path: "category", select: "name code" },
        { path: "subCategory", select: "name code" },
        { path: "type", select: "name code" },
        { path: "costCenter", select: "name code" },
        { path: "createdBy", select: "name email" },
      ]);

      return metalStock;
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Metal stock code already exists",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  }

  // Get all metal stocks with pagination and filters
  static async getAllMetalStocks(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        metalType,
        branch,
        category,
        status = "active",
        isActive = true,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = options;

      const skip = (page - 1) * limit;
      const query = {};

      // Build query filters
      if (search) {
        query.$or = [
          { code: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (metalType) query.metalType = metalType;
      if (branch) query.branch = branch;
      if (category) query.category = category;
      if (status) query.status = status;
      if (typeof isActive === "boolean") query.isActive = isActive;

      // Get total count
      const totalRecords = await MetalStock.countDocuments(query);

      // Get metal stocks with pagination
      const metalStocks = await MetalStock.find(query)
        .populate([
          { path: "metalType", select: "code description" },
          { path: "branch", select: "name code" },
          {
            path: "karat",
            select:
              "karatCode description minimum maximum isScrap standardPurity",
          },
          { path: "category", select: "code description" },
          { path: "subCategory", select: "code description" },
          { path: "type", select: "code description" },
          { path: "size", select: "code description" },
          { path: "color", select: "code description" },
          { path: "brand", select: "code description" },
          { path: "createdBy", select: "name email" },
          { path: "updatedBy", select: "name email" },
        ])
        .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalPages = Math.ceil(totalRecords / limit);

      return {
        metalStocks,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Get metal stock by ID
  static async getMetalStockById(id) {
    try {
      const metalStock = await MetalStock.findById(id).populate([
        { path: "metalType", select: "code description" },
        { path: "branch", select: "name code" },
        { path: "karat", select: "name value standardPurity" },
        { path: "category", select: "name code" },
        { path: "subCategory", select: "name code" },
        { path: "type", select: "name code" },
        { path: "costCenter", select: "name code" },
        { path: "size", select: "name value" },
        { path: "color", select: "name code" },
        { path: "brand", select: "name code" },
        { path: "country", select: "name code" },
        { path: "price", select: "amount currency" },
        { path: "charges", select: "name amount" },
        { path: "makingCharge", select: "name amount" },
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      if (!metalStock) {
        throw createAppError(
          "Metal stock not found",
          404,
          "METAL_STOCK_NOT_FOUND"
        );
      }

      return metalStock;
    } catch (error) {
      throw error;
    }
  }

  // Update metal stock
  static async updateMetalStock(id, updateData, adminId) {
    try {
      // Check if metal stock exists
      const existingMetalStock = await MetalStock.findById(id).populate([
        { path: "karat", select: "standardPurity" }
      ]);
      
      if (!existingMetalStock) {
        throw createAppError(
          "Metal stock not found",
          404,
          "METAL_STOCK_NOT_FOUND"
        );
      }

      // Store previous values for registry calculation
      const previousValues = {
        totalValue: existingMetalStock.totalValue,
        pcs: existingMetalStock.pcs,
        pcsCount: existingMetalStock.pcsCount,
        standardPurity: existingMetalStock.karat?.standardPurity || 0
      };

      // Check if code is being updated and if it already exists
      if (updateData.code && updateData.code !== existingMetalStock.code) {
        const codeExists = await MetalStock.isCodeExists(updateData.code, id);
        if (codeExists) {
          throw createAppError(
            "Metal stock code already exists",
            409,
            "DUPLICATE_CODE"
          );
        }
      }

      // Update metal stock
      const updatedMetalStock = await MetalStock.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updatedBy: adminId,
        },
        { new: true, runValidators: true }
      ).populate([
        { path: "metalType", select: "code description" },
        { path: "branch", select: "name code" },
        {
          path: "karat",
          select:
            "karatCode description minimum maximum isScrap standardPurity",
        },
        { path: "category", select: "code description" },
        { path: "subCategory", select: "code description" },
        { path: "type", select: "code description" },
        { path: "size", select: "code description" },
        { path: "color", select: "code description" },
        { path: "brand", select: "code description" },
        { path: "createdBy", select: "name email" },
        { path: "updatedBy", select: "name email" },
      ]);

      // Create Registry entries for stock update (only if values changed)
      const shouldCreateRegistry = 
        (updatedMetalStock.pcs && (
          previousValues.totalValue !== updatedMetalStock.totalValue ||
          previousValues.pcsCount !== updatedMetalStock.pcsCount
        )) ||
        (!updatedMetalStock.pcs && (
          previousValues.standardPurity !== (updatedMetalStock.karat?.standardPurity || 0)
        )) ||
        previousValues.pcs !== updatedMetalStock.pcs;

      if (shouldCreateRegistry) {
        await this.createRegistryEntries(updatedMetalStock, "UPDATE", adminId, previousValues);
      }

      return updatedMetalStock;
    } catch (error) {
      if (error.code === 11000) {
        throw createAppError(
          "Metal stock code already exists",
          409,
          "DUPLICATE_CODE"
        );
      }
      throw error;
    }
  }
  
  /* ---------------- DELETE (soft) ---------------- */
  static async deleteMetalStock(id, adminId) {
    try {
      const metalStock = await MetalStock.findById(id);
      if (!metalStock) {
        throw createAppError("Metal stock not found", 404, "METAL_STOCK_NOT_FOUND");
      }
  
      await this.createRegistryEntries(metalStock, "DELETE", adminId);
  
      const deletedMetalStock = await MetalStock.findByIdAndUpdate(
        id,
        {
          status: "inactive",
          isActive: false,
          updatedBy: adminId,
        },
        { new: true }
      );
  
      return deletedMetalStock;
    } catch (error) {
      throw error;
    }
  }

  // Hard delete metal stock (permanent deletion)
  static async hardDeleteMetalStock(id) {
    try {
      const metalStock = await MetalStock.findById(id);
      if (!metalStock) {
        throw createAppError(
          "Metal stock not found",
          404,
          "METAL_STOCK_NOT_FOUND"
        );
      }

      await MetalStock.findByIdAndDelete(id);
      return { message: "Metal stock permanently deleted" };
    } catch (error) {
      throw error;
    }
  }

  // Get low stock items (only for piece-based items)
  static async getLowStockItems(options = {}) {
    try {
      const { page = 1, limit = 10, branch, category } = options;

      const skip = (page - 1) * limit;
      const query = {
        pcs: true, // Only piece-based items can have low stock
        pcsCount: { $gte: 0 },
        isActive: true,
        status: "active",
      };

      if (branch) query.branch = branch;
      if (category) query.category = category;

      const totalRecords = await MetalStock.countDocuments(query);

      const lowStockItems = await MetalStock.find(query)
        .populate([
          { path: "metalType", select: "code description" },
          // { path: "branch", select: "name code" },
          { path: "category", select: "name code" },
        ])
        .sort({ pcsCount: 1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalPages = Math.ceil(totalRecords / limit);

      return {
        lowStockItems,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Update stock quantity (for pieces) or weight information
  static async updateStockQuantity(id, updateData, adminId) {
    try {
      const metalStock = await MetalStock.findById(id).populate([
        { path: "karat", select: "standardPurity" }
      ]);
      
      if (!metalStock) {
        throw createAppError(
          "Metal stock not found",
          404,
          "METAL_STOCK_NOT_FOUND"
        );
      }

      let updateFields = { updatedBy: adminId };
      let previousValues = {};

      if (metalStock.pcs) {
        // For piece-based stock
        const { pcsCount, totalValue } = updateData;
        
        if (pcsCount !== undefined && pcsCount < 0) {
          throw createAppError(
            "Piece count cannot be negative",
            400,
            "INVALID_QUANTITY"
          );
        }

        if (totalValue !== undefined && totalValue < 0) {
          throw createAppError(
            "Total value cannot be negative",
            400,
            "INVALID_VALUE"
          );
        }

        previousValues = {
          totalValue: metalStock.totalValue,
          pcsCount: metalStock.pcsCount,
          pcs: metalStock.pcs
        };

        if (pcsCount !== undefined) updateFields.pcsCount = pcsCount;
        if (totalValue !== undefined) updateFields.totalValue = totalValue;

      } else {
        // For weight-based stock - only track standardPurity changes
        previousValues = {
          standardPurity: metalStock.karat?.standardPurity || 0,
          pcs: metalStock.pcs
        };
      }

      const updatedMetalStock = await MetalStock.findByIdAndUpdate(
        id,
        updateFields,
        { new: true }
      ).populate([
        { path: "metalType", select: "code description" },
        // { path: "branch", select: "name code" },
        { path: "karat", select: "standardPurity" },
      ]);

      // Create Registry entries for quantity/weight update
      await this.createRegistryEntries(updatedMetalStock, "UPDATE", adminId, previousValues);

      return updatedMetalStock;
    } catch (error) {
      throw error;
    }
  }
}

export default MetalStockService;