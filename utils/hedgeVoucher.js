import VoucherMasterService from '../services/modules/VoucherMasterService.js';

/**
 * Map transaction types to hedge voucher modules
 * Receipt types (purchase-based) → hedge-metal-receipt
 * Payment types (sale-based) → hedge-metal-payment
 * 
 * This mapping supports all 8 transaction types:
 * - purchase, purchaseReturn, importPurchase, importPurchaseReturn → hedge-metal-receipt
 * - sale, saleReturn, exportSale, exportSaleReturn → hedge-metal-payment
 */
const TRANSACTION_TYPE_TO_MODULE = {
  // Receipt types (purchase-based) - use hedge-metal-receipt
  purchase: "hedge-metal-purchase",
  purchasereturn: "hedge-metal-purchase-return",
  importpurchase: "hedge-metal-import-purchase",
  importpurchasereturn: "hedge-metal-import-purchase-return",
  
  // Payment types (sale-based) - use hedge-metal-payment
  sale: "hedge-metal-sale",
  salereturn: "hedge-metal-sale-return",
  exportsale: "hedge-metal-export-sale",
  exportsalereturn: "hedge-metal-export-sale-return",
};

/**
 * Generate hedge voucher number dynamically using VoucherMasterService
 * This function replaces the old hardcoded prefix logic with dynamic voucher generation
 * based on VoucherMaster configuration. The voucher numbers are generated from
 * TransactionFixing model counts.
 * 
 * @param {string} transactionType - The transaction type (purchase, sale, purchaseReturn, etc.)
 * @returns {Promise<string>} - The generated hedge voucher number (e.g., "HPM0001", "HSM0001")
 * 
 * @example
 * // For purchase transaction
 * const voucher = await generateHedgeVoucherNumber("purchase");
 * // Returns: "HPM0001" (if configured in VoucherMaster with prefix "HPM")
 * 
 * @example
 * // For sale transaction
 * const voucher = await generateHedgeVoucherNumber("sale");
 * // Returns: "HSM0001" (if configured in VoucherMaster with prefix "HSM")
 */
export const generateHedgeVoucherNumber = async (transactionType) => {
  try {
    if (!transactionType) {
      throw new Error("Transaction type is required");
    }

    // Normalize transaction type to handle case variations
    const normalizedType = transactionType.toLowerCase().trim();
    
    // Get the module name for this transaction type
    console.log(normalizedType,"normalizedType🟢🟢🟢");
    console.log(TRANSACTION_TYPE_TO_MODULE,"TRANSACTION_TYPE_TO_MODULE🟢🟢🟢");
    const module = TRANSACTION_TYPE_TO_MODULE[normalizedType];
    console.log(module,"module🟢🟢🟢");
    if (!module) {
      throw new Error(
        `No hedge voucher module found for transaction type: ${transactionType}. ` +
        `Supported types: ${Object.keys(TRANSACTION_TYPE_TO_MODULE).join(", ")}`
      );
    }

    // Use VoucherMasterService to generate voucher number dynamically
    // This will:
    // 1. Get voucher config from VoucherMaster for the module
    // 2. Count existing transactions from TransactionFixing model (filtered by type)
    // 3. Generate next sequential voucher number with configured prefix
    const voucherData = await VoucherMasterService.generateVoucherNumber(
      module,
      normalizedType
    );

    console.log(
      `[generateHedgeVoucherNumber] Generated hedge voucher: ${voucherData.voucherNumber} ` +
      `for ${transactionType} (module: ${module})`
    );

    return voucherData.voucherNumber;
  } catch (error) {
    console.error(
      `[generateHedgeVoucherNumber] Error generating voucher for ${transactionType}:`,
      error.message || error
    );
    throw error;
  }
};