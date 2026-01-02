import { createAppError } from "../../utils/errorHandler.js";
import MetalStockService from "../../services/modules/MetalStockService.js";
import InventoryService from "../../services/modules/inventoryService.js";
import { createZohoContact, createZohoItem } from "../../services/integrations/zohoBooks.service.js";
import { getZohoConfig } from "../../services/integrations/zohoToken.service.js";

// Create new metal stock

export const createMetalStock = async (req, res, next) => {
  try {
    const {
      metalType,
      code,
      description,
      branch,
      karat,
      standardPurity,
      pcs,
      // pcsCount,
      totalValue,
      charges,
      makingCharge,
      costCenter,
      category,
      subCategory,
      type,
      size,
      color,
      brand,
      country,
      price,
      MakingUnit,
      ozDecimal,
      passPurityDiff,
      excludeVAT,
      vatOnMaking,
      wastage,
      includeVAT,
    } = req.body;
    // Validate required fields
    if (!metalType || !code || !description || !karat) {
      throw createAppError(
        "Required fields missing",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    if (pcs === undefined || pcs === null) {
      throw createAppError(
        "Pieces tracking option is required",
        400,
        "MISSING_PCS_OPTION"
      );
    }

    // Validate pcsCount and totalValue when pcs is true
    // if (pcs) {
    //   if (pcsCount === undefined || pcsCount === null || !Number.isInteger(pcsCount) || pcsCount < 0) {
    //     throw createAppError("Piece count is required and must be a non-negative integer for piece-based stock", 400, "INVALID_PCS_COUNT");
    //   }
    //   if (totalValue === undefined || totalValue === null || isNaN(totalValue) || totalValue < 0) {
    //     throw createAppError("Total value is required and must be a non-negative number for piece-based stock", 400, "INVALID_TOTAL_VALUE");
    //   }
    // }

    const metalStockData = {
      metalType: metalType.trim(),
      code: code.trim(),
      description: description.trim(),
      branch: branch || null,
      karat: karat.trim(),
      standardPurity:
        standardPurity !== undefined && standardPurity !== null
          ? parseFloat(standardPurity)
          : null,
      pcs: Boolean(pcs),
      // pcsCount: pcs ? parseInt(pcsCount) : 0,
      totalValue: pcs ? parseFloat(totalValue) : 0,
      charges: charges || null,
      makingCharge: makingCharge || null,
      costCenter: costCenter || null,
      category: category ? category.trim() : null,
      subCategory: subCategory ? subCategory.trim() : null,
      type: type ? type.trim() : null,
      size: size || null,
      color: color || null,
      brand: brand || null,
      country: country || null,
      price: price || null,
      referenceType: "metal-stock",
      // NEW FIELDS
      MakingUnit: MakingUnit || "grams",
      ozDecimal: ozDecimal ? parseFloat(ozDecimal) : null,
      passPurityDiff: passPurityDiff || false,
      excludeVAT: excludeVAT || false,
      vatOnMaking: vatOnMaking || false,
      wastage: wastage || false,
      includeVAT: includeVAT !== undefined ? includeVAT : true,
    };

    const result = await MetalStockService.createMetalStock(
      metalStockData,
      req.admin.id
    );
    await InventoryService.addInitialInventory(result, req.admin.id);

    let zohoItem = null;

    try {
      const zohoConfig = await getZohoConfig();

      zohoItem = await createZohoItem(result, {
        accessToken: zohoConfig.accessToken,
        orgId: zohoConfig.orgId,
        stockAccountId: zohoConfig.stockAccountId,
      });

    } catch (zohoError) {
      console.error("Zoho item creation failed:", zohoError.message);

      // mark sync failed (important)
      await MetalStockService.updateMetalStockWithZohoItem(result.id, {
        item_id: null,
        syncStatus: "FAILED",
        syncError: zohoError.message,
      });
    }

    // update the metal stock with zohoItemId if success
    if (zohoItem) {
      await MetalStockService.updateMetalStockWithZohoItem(
        result.id,
        zohoItem
      );
    }

    res.status(201).json({
      success: true,
      message: "Metal stock created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Get all metal stocks
export const getAllMetalStocks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      metalType,
      branch,
      category,
      status,
      isActive,
      sortBy,
      sortOrder,
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      metalType,
      branch,
      category,
      status,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      sortBy,
      sortOrder,
    };

    const result = await MetalStockService.getAllMetalStocks(options);

    res.status(200).json({
      success: true,
      message: "Metal stocks fetched successfully",
      data: result.metalStocks,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Get metal stock by ID
export const getMetalStockById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    const metalStock = await MetalStockService.getMetalStockById(id);

    res.status(200).json({
      success: true,
      message: "Metal stock fetched successfully",
      data: metalStock,
    });
  } catch (error) {
    next(error);
  }
};

// Update metal stock
export const updateMetalStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      metalType,
      code,
      description,
      branch,
      karat,
      standardPurity,
      pcs,
      // pcsCount,
      totalValue,
      charges,
      makingCharge,
      costCenter,
      category,
      subCategory,
      type,
      size,
      color,
      brand,
      country,
      price,
      MakingUnit,
      ozDecimal,
      passPurityDiff,
      excludeVAT,
      vatOnMaking,
      wastage,
      includeVAT,
    } = req.body;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    // Validate pcsCount and totalValue when pcs is true
    // if (pcs) {
    //   if (pcsCount !== undefined && (!Number.isInteger(pcsCount) || pcsCount < 0)) {
    //     throw createAppError("Piece count must be a non-negative integer for piece-based stock", 400, "INVALID_PCS_COUNT");
    //   }
    //   if (totalValue !== undefined && (isNaN(totalValue) || totalValue < 0)) {
    //     throw createAppError("Total value must be a non-negative number for piece-based stock", 400, "INVALID_TOTAL_VALUE");
    //   }
    // }

    const cleanedUpdateData = {};
    if (metalType) cleanedUpdateData.metalType = metalType.trim();
    if (code) cleanedUpdateData.code = code.trim();
    if (description) cleanedUpdateData.description = description.trim();
    if (branch !== undefined) cleanedUpdateData.branch = branch || null;
    if (karat) cleanedUpdateData.karat = karat.trim();
    if (standardPurity !== undefined)
      cleanedUpdateData.standardPurity =
        standardPurity !== null ? parseFloat(standardPurity) : null;
    if (pcs !== undefined) cleanedUpdateData.pcs = Boolean(pcs);
    if (pcs) {
      // if (pcsCount !== undefined) cleanedUpdateData.pcsCount = parseInt(pcsCount);
      if (totalValue !== undefined)
        cleanedUpdateData.totalValue = parseFloat(totalValue);
    } else {
      // cleanedUpdateData.pcsCount = 0;
      cleanedUpdateData.totalValue = 0;
    }
    if (charges !== undefined) cleanedUpdateData.charges = charges || null;
    if (makingCharge !== undefined)
      cleanedUpdateData.makingCharge = makingCharge || null;
    if (costCenter !== undefined)
      cleanedUpdateData.costCenter = costCenter || null;
    if (category) cleanedUpdateData.category = category.trim();
    if (subCategory) cleanedUpdateData.subCategory = subCategory.trim();
    if (type) cleanedUpdateData.type = type.trim();
    if (size !== undefined) cleanedUpdateData.size = size || null;
    if (color !== undefined) cleanedUpdateData.color = color || null;
    if (brand !== undefined) cleanedUpdateData.brand = brand || null;
    if (country !== undefined) cleanedUpdateData.country = country || null;
    if (price !== undefined) cleanedUpdateData.price = price || null;

    // NEW FIELDS
    if (MakingUnit !== undefined) cleanedUpdateData.MakingUnit = MakingUnit;
    if (ozDecimal !== undefined)
      cleanedUpdateData.ozDecimal = ozDecimal ? parseFloat(ozDecimal) : null;

    if (passPurityDiff !== undefined)
      cleanedUpdateData.passPurityDiff = passPurityDiff || false;
    if (includeVAT !== undefined)
      cleanedUpdateData.includeVAT = excludeVAT || vatOnMaking ? !includeVAT : includeVAT || true;

    if (excludeVAT !== undefined)
      cleanedUpdateData.excludeVAT = excludeVAT || false;

    if (vatOnMaking !== undefined)
      cleanedUpdateData.vatOnMaking = vatOnMaking || false;

    if (wastage !== undefined) cleanedUpdateData.wastage = wastage || false;

    const updatedMetalStock = await MetalStockService.updateMetalStock(
      id,
      cleanedUpdateData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Metal stock updated successfully",
      data: updatedMetalStock,
    });
  } catch (error) {
    next(error);
  }
};

// Delete metal stock (soft delete)
export const deleteMetalStock = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    const deletedMetalStock = await MetalStockService.deleteMetalStock(
      id,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Metal stock deleted successfully",
      data: deletedMetalStock,
    });
  } catch (error) {
    next(error);
  }
};

// Hard delete metal stock
export const hardDeleteMetalStock = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    const result = await MetalStockService.hardDeleteMetalStock(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

// Get metal stock statistics
export const getMetalStockStats = async (req, res, next) => {
  try {
    const { branch, category } = req.query;

    const stats = await MetalStockService.getMetalStockStats({
      branch,
      category,
    });

    res.status(200).json({
      success: true,
      message: "Metal stock statistics fetched successfully",
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

// Get stock movements
export const getStockMovements = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await MetalStockService.getStockMovements(id, options);

    res.status(200).json({
      success: true,
      message: "Stock movements fetched successfully",
      data: result.movements,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// Update stock quantity
export const updateStockQuantity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      pcsCount,
      totalValue,
      quantity,
      transactionType,
      description,
      costCenterCode,
    } = req.body;

    if (!id) {
      throw createAppError("Metal stock ID is required", 400, "MISSING_ID");
    }

    if (!transactionType) {
      throw createAppError(
        "Transaction type is required",
        400,
        "MISSING_TRANSACTION_TYPE"
      );
    }

    if (!["stock_in", "purchase"].includes(transactionType)) {
      throw createAppError(
        "Invalid transaction type. Must be one of: stock_in, purchase",
        400,
        "INVALID_TRANSACTION_TYPE"
      );
    }

    if (!description) {
      throw createAppError(
        "Transaction description is required",
        400,
        "MISSING_DESCRIPTION"
      );
    }

    // Validate inputs based on pcs
    const metalStock = await MetalStockService.getMetalStockById(id);
    if (metalStock.pcs) {
      // if (pcsCount === undefined || pcsCount === null) {
      //   throw createAppError("Piece count is required for piece-based stock", 400, "MISSING_PCS_COUNT");
      // }
      // if (!Number.isInteger(pcsCount) || pcsCount <= 0) {
      //   throw createAppError("Piece count must be a positive integer", 400, "INVALID_PCS_COUNT");
      // }
      if (totalValue === undefined || totalValue === null) {
        throw createAppError(
          "Total value is required for piece-based stock",
          400,
          "MISSING_TOTAL_VALUE"
        );
      }
      if (isNaN(totalValue) || totalValue <= 0) {
        throw createAppError(
          "Total value must be a positive number",
          400,
          "INVALID_TOTAL_VALUE"
        );
      }
    } else {
      if (quantity === undefined || quantity === null) {
        throw createAppError(
          "Quantity is required for weight-based stock",
          400,
          "MISSING_QUANTITY"
        );
      }
      if (isNaN(quantity) || quantity <= 0) {
        throw createAppError(
          "Quantity must be a positive number",
          400,
          "INVALID_QUANTITY"
        );
      }
    }

    const result = await MetalStockService.updateStockQuantity(
      id,
      { pcsCount, totalValue, quantity },
      transactionType,
      description,
      req.admin.id,
      costCenterCode
    );

    res.status(200).json({
      success: true,
      message: `Stock updated successfully (Pcs: ${result.adjustedPcs}, Value: ${result.adjustedValue})`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
