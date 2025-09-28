import VoucherMasterService from "../../services/modules/VoucherMasterService.js";
import { createAppError } from "../../utils/errorHandler.js";

export const createVoucher = async (req, res, next) => {
  try {
    const {
      description,
      voucherType,
      module,
      prefix,
      numberLength,
      dateFormat,
      isAutoIncrement,
    } = req.body;

    if (!description || !voucherType || !module || !prefix) {
      throw createAppError(
        "Required fields: description, voucherType, module, prefix",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    const voucherData = {
      description: description.trim(),
      voucherType: voucherType.trim().toUpperCase(),
      module: module.trim(),
      prefix: prefix.trim().toUpperCase(),
      numberLength: numberLength || 4,
      dateFormat: dateFormat || "DD/MM/YYYY",
      isAutoIncrement: isAutoIncrement !== undefined ? isAutoIncrement : true,
    };

    const voucher = await VoucherMasterService.createVoucher(voucherData, req.admin.id);

    res.status(201).json({
      success: true,
      message: "Voucher created successfully",
      data: voucher,
    });
  } catch (error) {
    next(error);
  }
};

export const updateVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id) throw createAppError("Voucher ID is required", 400, "MISSING_ID");
    if (Object.keys(updateData).length === 0) {
      throw createAppError("Update data is required", 400, "NO_UPDATE_DATA");
    }

    const cleanUpdateData = {};
    const allowedFields = [
      "description",
      "voucherType",
      "module",
      "prefix",
      "numberLength",
      "dateFormat",
      "isAutoIncrement",
      "isActive",
      "status",
      "sequence",
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        cleanUpdateData[field] =
          typeof updateData[field] === "string" ? updateData[field].trim() : updateData[field];
        if (field === "voucherType" || field === "prefix") {
          cleanUpdateData[field] = cleanUpdateData[field].toUpperCase();
        }
      }
    });

    const voucher = await VoucherMasterService.updateVoucher(id, cleanUpdateData, req.admin.id);

    res.status(200).json({
      success: true,
      message: "Voucher updated successfully",
      data: voucher,
    });
  } catch (error) {
    next(error);
  }
};

export const getAllVouchers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const filters = {
      status: req.query.status,
      isActive: req.query.isActive,
      voucherType: req.query.voucherType,
      module: req.query.module,
      search: req.query.search,
    };

    const result = await VoucherMasterService.getAllVouchers(page, limit, filters);

    res.status(200).json({
      success: true,
      message: "Vouchers retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getVoucherById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createAppError("Voucher ID is required", 400, "MISSING_ID");

    const voucher = await VoucherMasterService.getVoucherById(id);

    res.status(200).json({
      success: true,
      message: "Voucher retrieved successfully",
      data: voucher,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createAppError("Voucher ID is required", 400, "MISSING_ID");

    const voucher = await VoucherMasterService.deleteVoucher(id, req.admin.id);

    res.status(200).json({
      success: true,
      message: "Voucher deleted successfully",
      data: voucher,
    });
  } catch (error) {
    next(error);
  }
};

export const hardDeleteVoucher = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createAppError("Voucher ID is required", 400, "MISSING_ID");

    const result = await VoucherMasterService.hardDeleteVoucher(id);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export const getVouchersByModule = async (req, res, next) => {
  try {
    const { module } = req.params;
    const { voucherType, page = 1, limit = 10 } = req.query;

    if (!module) {
      throw createAppError("Module is required", 400, "MISSING_MODULE");
    }

    const result = await VoucherMasterService.getVouchersByModule(
      module,
      voucherType,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      message: "Vouchers retrieved successfully",
      data: result.vouchers,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Optimized voucher number generation
export const generateVoucherNumber = async (req, res, next) => {
  try {
    const { module } = req.params;
    const { transactionType, entryType } = req.body;

    if (!module) {
      throw createAppError("Module is required", 400, "MISSING_MODULE");
    }

    // Determine the actual transaction type based on module and query params
    let actualTransactionType = transactionType;

    // For entry modules, use entryType as transactionType
    if (module.toLowerCase().includes('entry') && entryType) {
      actualTransactionType = entryType;
    }
    const result = await VoucherMasterService.generateVoucherNumber(module, actualTransactionType);
    res.status(200).json({
      success: true,
      message: "Voucher number generated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Consolidated voucher info endpoint
export const getVoucherInfoByModule = async (req, res, next) => {
  try {
    const { module } = req.params;
    const { transactionType, entryType } = req.query;

    if (!module) {
      throw createAppError("Module is required", 400, "MISSING_MODULE");
    }

    // Determine the actual transaction type based on module and query params
    let actualTransactionType = transactionType;

    // For entry modules, use entryType as transactionType if provided
    if (module.toLowerCase().includes('entry') && entryType) {
      actualTransactionType = entryType;
    }

    let result;
    const moduleLC = module.toLowerCase();

    // Route to appropriate service method based on module type
    if (moduleLC.includes('metal')) {
      if (actualTransactionType === 'purchase' || moduleLC.includes('purchase')) {
        result = await VoucherMasterService.getMetalPurchaseVoucherInfo(module);
      } else if (actualTransactionType === 'sale' || moduleLC.includes('sale')) {
        result = await VoucherMasterService.getMetalSaleVoucherInfo(module);
      } else {
        // General metal voucher info
        const voucherData = await VoucherMasterService.generateVoucherNumber(module, actualTransactionType);
        result = {
          prefix: voucherData.prefix,
          currentCount: voucherData.transactionCount,
          nextSequence: voucherData.sequence,
          nextVoucherNumber: voucherData.voucherNumber,
          numberLength: voucherData.voucherConfig.numberLength,
          voucherConfig: voucherData.voucherConfig,
          transactionType: actualTransactionType
        };
      }
    } else if (moduleLC.includes('entry')) {
      if (actualTransactionType) {
        const validEntryTypes = ["metal-receipt", "metal-payment", "cash receipt", "cash payment","currency-receipt"];
        if (validEntryTypes.includes(actualTransactionType.toLowerCase())) {
          result = await VoucherMasterService.getEntryVoucherInfo(module, actualTransactionType);
        } else {
          throw createAppError(
            `Invalid entry type. Valid types: ${validEntryTypes.join(', ')}`,
            400,
            "INVALID_ENTRY_TYPE"
          );
        }
      } else {
        // Return all entry types info
        result = await VoucherMasterService.getAllEntryTypesVoucherInfo(module);
      }
    } else {
      // For other modules, use the general voucher generation
      const voucherData = await VoucherMasterService.generateVoucherNumber(module, actualTransactionType);
      result = {
        prefix: voucherData.prefix,
        currentCount: voucherData.transactionCount,
        nextSequence: voucherData.sequence,
        nextVoucherNumber: voucherData.voucherNumber,
        numberLength: voucherData.voucherConfig.numberLength,
        voucherConfig: voucherData.voucherConfig,
        transactionType: actualTransactionType
      };
    }

    res.status(200).json({
      success: true,
      message: `Voucher info for ${module} retrieved successfully`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};