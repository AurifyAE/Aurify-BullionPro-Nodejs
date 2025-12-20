import VoucherMaster from "../../models/modules/VoucherMaster.js";
import MetalTransaction from "../../models/modules/MetalTransaction.js";
import TransactionFix from "../../models/modules/TransactionFixing.js";
import Entry from "../../models/modules/EntryModel.js";
import { createAppError } from "../../utils/errorHandler.js";
import FundTransfer from "../../models/modules/FundTransfer.js";
import MetalStock from "../../models/modules/MetalStock.js";
import Registry from "../../models/modules/Registry.js";
import InventoryLog from "../../models/modules/InventoryLog.js";

class VoucherMasterService {
  // Cache for voucher configurations to reduce DB queries
  static voucherCache = new Map();
  static cacheExpiry = 5 * 60 * 1000; // 5 minutes

  // Generate code based on prefix
  static async generateCode(prefix) {
    const count = await VoucherMaster.countDocuments({ prefix });
    const sequence = (count + 1).toString().padStart(3, "0");
    return `${prefix}${sequence}`;
  }

  // Get voucher configuration with caching
  static async getVoucherConfig(module) {
    const cacheKey = module.toLowerCase();
    const cached = this.voucherCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    console.log(`[getVoucherConfig] Getting voucher configuration for module: ${module}`);
    const voucher = await VoucherMaster.findOne({
      module: { $regex: `^${module}$`, $options: "i" },
      isActive: true,
      status: "active"
    });

    if (!voucher) {
      throw createAppError(
        `No active voucher configuration found for module: ${module}`,
        404,
        "VOUCHER_CONFIG_NOT_FOUND"
      );
    }

    // Cache the result
    this.voucherCache.set(cacheKey, {
      data: voucher,
      timestamp: Date.now()
    });

    return voucher;
  }

  // Clear cache for a specific module
  static clearCache(module = null) {
    if (module) {
      this.voucherCache.delete(module.toLowerCase());
    } else {
      this.voucherCache.clear();
    }
  }

  // Optimized transaction count method
  static async getTransactionCount(module, transactionType) {
    const moduleLC = module.toLowerCase();
    console.log(`[getTransactionCount] INPUT: module="${module}", transactionType="${transactionType}"`);

    try {
      // Entry-based modules
      const entryModules = ["metal-payment", "metal-receipt", "currency-payment", "currency-receipt", "entry"];
      if (entryModules.includes(moduleLC)) {
        console.log(`[getTransactionCount] Using model: Entry`);

        const query = transactionType
          ? { type: { $regex: `^${transactionType}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] Entry Query:`, query);
        const count = await Entry.countDocuments(query);
        console.log(`[getTransactionCount] Entry Count:`, count);
        return count;
      }

      // MetalTransaction-based modules
      const metalTxnModules = [
        "metal-purchase", 
        "metal-sale", 
        "purchase-return", 
        "sales-return",
        "importpurchase",
        "importpurchasereturn",
        "exportsale",
        "exportsalereturn"
      ];
      console.log(`[getTransactionCount] Metal transaction modules:`, metalTxnModules,moduleLC);
      if (metalTxnModules.includes(moduleLC)) {
        console.log(`[getTransactionCount] Using model: MetalTransaction`);

        // Map module names to transaction types for proper filtering
        const moduleToTransactionType = {
          "metal-purchase": "purchase",
          "metal-sale": "sale",
          "purchase-return": "purchaseReturn",
          "sales-return": "saleReturn",
          "metal-import-purchase": "importPurchase",
          "metal-import-purchase-return": "importPurchaseReturn",
          "metal-export-sale": "exportSale",
          "metal-export-sale-return": "exportSaleReturn"
        };
        console.log(`[getTransactionCount] Module to transaction type:`, moduleToTransactionType,transactionType);
        // Use provided transactionType if available, otherwise map from module
        const typeToUse = transactionType || moduleToTransactionType[moduleLC];
        console.log(`[getTransactionCount] Type to use:`, typeToUse);
        const query = typeToUse
          ? { transactionType: { $regex: `^${typeToUse}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] MetalTransaction Query:`, query);
        const count = await MetalTransaction.countDocuments(query);
        console.log(`[getTransactionCount] MetalTransaction Count:`, count);
        return count;
      }

      // Hedge Metal Transaction modules - use TransactionFixing model
      const hedgeMetalModules = ["hedge-metal-payment", "hedge-metal-receipt","hedge-metal-purchase","hedge-metal-sale","hedge-metal-purchase-return","hedge-metal-sale-return","hedge-metal-import-purchase","hedge-metal-import-purchase-return","hedge-metal-export-sale","hedge-metal-export-sale-return"];
      if (hedgeMetalModules.includes(moduleLC)) {
        console.log(`[getTransactionCount] Using model: TransactionFixing (Hedge)`);

        const query = {};

        // Add transactionType filter if provided
        // Query by transactionType field (purchase, sale, purchaseReturn, etc.)
        // This field stores the original transaction type for voucher counting
        if (transactionType) {
          // Normalize transaction type to lowercase for matching
          const normalizedType = transactionType.toLowerCase().trim();
          console.log(`[getTransactionCount] Normalized transaction type:`, normalizedType);
          query.transactionType = { $regex: `^${normalizedType}$`, $options: "i" };
        }

        console.log(`[getTransactionCount] TransactionFixing (Hedge) Query:`, query);
        const count = await TransactionFix.countDocuments(query);
        console.log(`[getTransactionCount] TransactionFixing (Hedge) Count:`, count);
        return count;
      }

      // TransactionFix-based modules
      const fixModules = ["sales-fixing", "purchase-fixing"];
      if (fixModules.includes(moduleLC)) {
        console.log(`[getTransactionCount] Using model: TransactionFix`);

        const query = transactionType
          ? { type: { $regex: `^${transactionType}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] TransactionFix Query:`, query);
        const count = await TransactionFix.countDocuments(query);
        console.log(`[getTransactionCount] TransactionFix Count:`, count);
        return count;
      }

      // Transfer module
      if (moduleLC === "transfer") {
        console.log(`[getTransactionCount] Using model: FundTransfer`);

        const query = transactionType
          ? { type: { $regex: `^${transactionType}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] FundTransfer Query:`, query);
        const count = await FundTransfer.countDocuments(query);
        console.log(`[getTransactionCount] FundTransfer Count:`, count);
        return count;
      }

      // Opening Balance
      if (moduleLC === "opening-balance") {
        console.log(`[getTransactionCount] Using model: FundTransfer`);

        const query = transactionType
          ? { type: { $regex: `^${transactionType}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] FundTransfer Query:`, query);
        const count = await FundTransfer.countDocuments(query);
        console.log(`[getTransactionCount] FundTransfer Count:`, count);
        return count;
      }

      // Metal Stock
      if (moduleLC === "metal-stock") {
        console.log(`[getTransactionCount] Using model: MetalStock`);
        const value = "opening"

        const query = transactionType
          ? { transactionType: { $regex: `^${value}$`, $options: "i" } }
          : {};

        console.log(`[getTransactionCount] MetalStock Query:`, query);
        const count = await InventoryLog.countDocuments(query);
        console.log(`[getTransactionCount] MetalStock Count:`, count);
        return count;
      }
      if (moduleLC === "opening-stock-balance") {
        console.log(`[getTransactionCount] Using model: registry`);

        const query = {
          $or: [
            { costCenter: "INVENTORY" },
            { reference: { $regex: "^OSB", $options: "i" } },
          ],
        };

        console.log(`[getTransactionCount] Registry Query:`, query);

        const count = await Registry.countDocuments(query);
        console.log(`[getTransactionCount] Registry Count:`, count);

        return count;
      }

      // Draft Metal module - Get last voucher number instead of counting
      // This prevents duplicate numbers when drafts are deleted
      if (moduleLC === "draft-metal") {
        console.log(`[getTransactionCount] Using model: Drafting - Getting last voucher number`);

        const { default: Drafting } = await import("../../models/modules/Drafting.js");

        // Get voucher config first to know the prefix
        const voucher = await this.getVoucherConfig(module);
        const prefix = voucher.prefix;

        // Build query to find drafts with voucherCode matching the prefix
        const matchQuery = {
          voucherCode: {
            $exists: true,
            $ne: null,
            $ne: "",
            $regex: `^${prefix}` // Match voucher codes starting with the prefix
          }
        };
        if (transactionType) {
          matchQuery.voucherType = { $regex: `^${transactionType}$`, $options: "i" };
        }

        // Use aggregation to extract numeric parts and find the maximum
        const result = await Drafting.aggregate([
          { $match: matchQuery },
          {
            $project: {
              voucherCode: 1,
              // Extract numeric part after prefix
              numericPart: {
                $substr: [
                  "$voucherCode",
                  prefix.length,
                  { $strLenCP: "$voucherCode" }
                ]
              }
            }
          },
          {
            $project: {
              voucherCode: 1,
              number: {
                $convert: {
                  input: "$numericPart",
                  to: "int",
                  onError: 0,
                  onNull: 0
                }
              }
            }
          },
          {
            $group: {
              _id: null,
              maxNumber: { $max: "$number" }
            }
          }
        ]);

        if (!result || result.length === 0 || !result[0].maxNumber) {
          console.log(`[getTransactionCount] No drafts with valid voucherCode found, returning 0`);
          return 0;
        }

        const maxNumber = result[0].maxNumber;
        console.log(`[getTransactionCount] Maximum voucher number found: ${maxNumber}, returning ${maxNumber}`);
        return maxNumber;
      }


      console.warn(`[getTransactionCount] No matching model for module="${module}". Returning 0.`);
      return 0;
    } catch (error) {
      console.error(`[getTransactionCount] ERROR for module="${module}":`, error);
      return 0;
    }
  }


  // Format date based on voucher date format
  static formatDate(dateFormat) {
    const today = new Date();

    switch (dateFormat) {
      case "DD/MM/YYYY":
        return `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`;
      case "MM/DD/YYYY":
        return `${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getDate().toString().padStart(2, "0")}/${today.getFullYear()}`;
      case "YYYY-MM-DD":
        return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;
      default:
        return today.toISOString().split("T")[0];
    }
  }

  // Main voucher number generation method - optimized
  static async generateVoucherNumber(module, transactionType = null) {
    if (!module) {
      throw createAppError("Module is required", 400, "MISSING_MODULE");
    }

    // Get voucher configuration (with caching)
    const voucher = await this.getVoucherConfig(module);
    // Get transaction count
    const transactionCount = await this.getTransactionCount(module, transactionType);
    // Generate next voucher number
    const nextSequence = transactionCount + 1;
    const voucherNumber = `${voucher.prefix}${nextSequence.toString().padStart(voucher.numberLength, "0")}`;

    // Format date
    const formattedDate = this.formatDate(voucher.dateFormat);

    // Update sequence if auto-increment is enabled
    if (voucher.isAutoIncrement) {
      await VoucherMaster.findByIdAndUpdate(
        voucher._id,
        { $inc: { sequence: 1 } }
      );
    }

    return {
      voucherType: voucher.voucherType,
      module: voucher.module,
      prefix: voucher.prefix,
      voucherNumber,
      sequence: nextSequence,
      transactionCount: transactionCount,
      transactionType: transactionType,
      date: new Date().toISOString().split("T")[0],
      formattedDate,
      voucherConfig: {
        numberLength: voucher.numberLength,
        dateFormat: voucher.dateFormat,
        isAutoIncrement: voucher.isAutoIncrement,
        description: voucher.description
      }
    };
  }

  // Unified voucher info method
  static async getVoucherInfo(module, transactionType = null) {
    try {
      const voucher = await this.getVoucherConfig(module);
      const transactionCount = await this.getTransactionCount(module, transactionType);

      const nextSequence = transactionCount + 1;
      const nextVoucherNumber = `${voucher.prefix}${nextSequence.toString().padStart(voucher.numberLength, "0")}`;

      return {
        prefix: voucher.prefix,
        currentCount: transactionCount,
        nextSequence: nextSequence,
        nextVoucherNumber: nextVoucherNumber,
        numberLength: voucher.numberLength,
        transactionType: transactionType,
        voucherConfig: {
          id: voucher._id,
          description: voucher.description,
          voucherType: voucher.voucherType,
          module: voucher.module,
          dateFormat: voucher.dateFormat,
          isAutoIncrement: voucher.isAutoIncrement,
          isActive: voucher.isActive,
          status: voucher.status
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Specific methods for backward compatibility
  static async getMetalPurchaseVoucherInfo(module = "metal-purchase") {
    return await this.getVoucherInfo(module, "purchase");
  }

  static async getMetalSaleVoucherInfo(module = "metal-sale") {
    return await this.getVoucherInfo(module, "sale");
  }

  static async getEntryVoucherInfo(module, entryType) {
    const validEntryTypes = ["metal-receipt", "metal-payment", "cash receipt", "cash payment", "currency-receipt"];

    if (!validEntryTypes.includes(entryType.toLowerCase())) {
      throw createAppError(
        `Invalid entry type. Valid types: ${validEntryTypes.join(', ')}`,
        400,
        "INVALID_ENTRY_TYPE"
      );
    }

    const result = await this.getVoucherInfo(module, entryType);
    result.entryType = entryType;
    return result;
  }

  static async getAllEntryTypesVoucherInfo(module = "entry") {
    try {
      const voucher = await this.getVoucherConfig(module);
      const entryTypes = ["metal-receipt", "metal-payment", "cash receipt", "cash payment"];
      const entryTypesInfo = {};

      // Get counts for all entry types in parallel
      const countPromises = entryTypes.map(async (type) => {
        const count = await Entry.countDocuments({
          type: { $regex: `^${type}$`, $options: "i" }
        });

        const nextSequence = count + 1;
        const nextVoucherNumber = `${voucher.prefix}${nextSequence.toString().padStart(voucher.numberLength, "0")}`;

        return {
          type,
          data: {
            currentCount: count,
            nextSequence: nextSequence,
            nextVoucherNumber: nextVoucherNumber
          }
        };
      });

      const results = await Promise.all(countPromises);
      results.forEach(({ type, data }) => {
        entryTypesInfo[type] = data;
      });

      return {
        prefix: voucher.prefix,
        numberLength: voucher.numberLength,
        voucherConfig: {
          id: voucher._id,
          description: voucher.description,
          voucherType: voucher.voucherType,
          module: voucher.module,
          dateFormat: voucher.dateFormat,
          isAutoIncrement: voucher.isAutoIncrement
        },
        entryTypes: entryTypesInfo
      };
    } catch (error) {
      throw error;
    }
  }

  // Create voucher - clear cache after creation
  static async createVoucher(voucherData, createdBy) {
    const { prefix, voucherType, module } = voucherData;

    if (await VoucherMaster.isVoucherTypeAndModuleExists(voucherType, module)) {
      throw createAppError(
        "Voucher type and module combination already exists",
        400,
        "DUPLICATE_VOUCHER_TYPE_MODULE"
      );
    }

    const code = await this.generateCode(prefix);

    const voucher = new VoucherMaster({
      ...voucherData,
      code,
      createdBy,
    });

    await voucher.save();

    // Clear cache for this module
    this.clearCache(module);

    return voucher;
  }

  // Update voucher - clear cache after update
  static async updateVoucher(id, updateData, updatedBy) {
    const { prefix, voucherType, module } = updateData;

    const voucher = await VoucherMaster.findById(id);
    if (!voucher) {
      throw createAppError("Voucher not found", 404, "VOUCHER_NOT_FOUND");
    }

    if (voucherType && module && (await VoucherMaster.isVoucherTypeAndModuleExists(voucherType, module, id))) {
      throw createAppError(
        "Voucher type and module combination already exists",
        400,
        "DUPLICATE_VOUCHER_TYPE_MODULE"
      );
    }

    if (prefix && prefix !== voucher.prefix) {
      updateData.code = await this.generateCode(prefix);
    }

    Object.assign(voucher, { ...updateData, updatedBy });
    await voucher.save();

    // Clear cache for this module
    this.clearCache(voucher.module);

    return voucher;
  }

  // Other existing methods remain the same
  static async getAllVouchers(page = 1, limit = 10, filters = {}) {
    const { status, isActive, voucherType, module, search } = filters;
    const query = {};

    if (status) query.status = status;
    if (isActive !== undefined) query.isActive = isActive;
    if (voucherType) query.voucherType = { $regex: `^${voucherType}$`, $options: "i" };
    if (module) query.module = { $regex: `^${module}$`, $options: "i" };

    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { voucherType: { $regex: search, $options: "i" } },
        { module: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const vouchers = await VoucherMaster.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await VoucherMaster.countDocuments(query);
    return { vouchers, total, page, limit };
  }

  static async getVoucherById(id) {
    const voucher = await VoucherMaster.findById(id);
    if (!voucher) {
      throw createAppError("Voucher not found", 404, "VOUCHER_NOT_FOUND");
    }
    return voucher;
  }

  static async deleteVoucher(id, updatedBy) {
    const voucher = await VoucherMaster.findById(id);
    if (!voucher) {
      throw createAppError("Voucher not found", 404, "VOUCHER_NOT_FOUND");
    }

    const module = voucher.module;
    await VoucherMaster.findByIdAndDelete(id);

    // Clear cache for this module
    this.clearCache(module);

    return { message: "Voucher permanently deleted" };
  }

  static async hardDeleteVoucher(id) {
    const voucher = await VoucherMaster.findById(id);
    if (!voucher) {
      throw createAppError("Voucher not found", 404, "VOUCHER_NOT_FOUND");
    }

    const module = voucher.module;
    await VoucherMaster.findByIdAndDelete(id);

    // Clear cache for this module
    this.clearCache(module);

    return { message: "Voucher permanently deleted" };
  }

  static async getVouchersByModule(module, voucherType, page = 1, limit = 10) {
    if (!module) {
      throw createAppError("Module is required", 400, "MISSING_MODULE");
    }

    const query = {
      module: { $regex: `^${module}$`, $options: "i" },
      isActive: true,
      status: "active"
    };

    if (voucherType) {
      query.voucherType = { $regex: `^${voucherType}$`, $options: "i" };
    }

    const skip = (page - 1) * limit;

    const vouchers = await VoucherMaster.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await VoucherMaster.countDocuments(query);

    if (!vouchers.length && page === 1) {
      throw createAppError("No vouchers found for module", 404, "VOUCHERS_NOT_FOUND");
    }

    return { vouchers, total, page, limit };
  }
}

export default VoucherMasterService;