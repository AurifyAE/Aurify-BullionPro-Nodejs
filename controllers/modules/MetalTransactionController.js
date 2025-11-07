import InventoryService from "../../services/modules/inventoryService.js";
import MetalTransactionService from "../../services/modules/MetalTransactionService.js";
import { createAppError } from "../../utils/errorHandler.js";

// Utility functions
const trim = (val) => (typeof val === "string" ? val.trim() : val);
const toNumber = (val, fallback = 0) => {
  const num = parseFloat(val);
  return isNaN(num) ? fallback : num;
};
const toDate = (val) => (val ? new Date(val) : null);

// ======================== CREATE METAL TRANSACTION ========================
export const createMetalTransaction = async (req, res, next) => {
  // console.log("CREATE BODY:", JSON.stringify(req.body, null, 2));
  try {
    const {
      transactionType,
      fix,
      unfix,
      partyCode,
      partyCurrency,
      itemCurrency,
      partyCurrencyRate = 1,
      voucherType,
      voucherDate,
      voucherNumber,  
      supplierInvoiceNo,
      supplierDate,
      metalRateUnit,
      stockItems = [],
      otherCharges = [],
      totalSummary,
      totalAmount = 0,
      enteredBy,
      salesman,
      status = "draft",
      notes,
    } = req.body;

    // === VALIDATION ===
    if (
      !transactionType ||
      !partyCode ||
      !partyCurrency ||
      !Array.isArray(stockItems) ||
      stockItems.length === 0
    ) {
      throw createAppError(
        "Required: transactionType, partyCode, partyCurrency, stockItems",
        400,
        "REQUIRED_FIELDS_MISSING"
      );
    }

    if (
      !["purchase", "sale", "purchaseReturn", "saleReturn"].includes(
        transactionType
      )
    ) {
      throw createAppError(
        "Invalid transactionType. Allowed: purchase, sale, purchaseReturn, saleReturn",
        400,
        "INVALID_TRANSACTION_TYPE"
      );
    }

    if (
      ![
        "METAL_PURCHASE",
        "METAL_SALE",
        "METAL_PURCHASE_RETURN",
        "METAL_SALE_RETURN",
      ].includes(voucherType)
    ) {
      throw createAppError("Invalid voucherType", 400, "INVALID_VOUCHER_TYPE");
    }

    // === MAP STOCK ITEMS ===
    const mappedStockItems = stockItems.map((item) => {
      if (!item.stockCode)
        throw createAppError("stockCode required in stockItems", 400);

      const {
        stockCode,
        description,
        grossWeight,
        purityStd,
        purity,
        pureWeightStd,
        pureWeight,
        purityDifference,
        weightInOz,
        metalRate,
        makingUnit,
        premiumDiscount,
        vat,
        itemTotal,
        remarks,
      } = item;

      return {
        stockCode: trim(stockCode),
        description: trim(description) || "",
        grossWeight: toNumber(grossWeight),
        purityStd: toNumber(purityStd, 0.999),
        purity: toNumber(purity),
        pureWeightStd: toNumber(pureWeightStd),
        pureWeight: toNumber(pureWeight) ? toNumber(pureWeight) : pureWeightStd,
        purityDifference: toNumber(purityDifference) ?toNumber(purityDifference) : 0 ,
        weightInOz: toNumber(weightInOz),
        metalRate: metalRate?.type || null,
        passPurityDiff: Boolean(item.passPurityDiff),
        vatOnMaking: Boolean(item.vatOnMaking),
        excludeVAT: Boolean(item.excludeVAT),
        metalRateRequirements: {
          amount: toNumber(metalRate?.rate),
          rateInGram: toNumber(metalRate?.rateInGram),
          currentBidValue: toNumber(metalRate?.currentBidValue),
          bidValue: toNumber(metalRate?.bidValue),
        },
        metalAmount: toNumber(itemTotal?.baseAmount),
        makingUnit: {
          unit: makingUnit?.unit || "percentage",
          makingRate: toNumber(makingUnit?.makingRate),
          makingAmount: toNumber(makingUnit?.makingAmount),
        },
        premiumDiscount: {
          rate: toNumber(premiumDiscount?.rate),
          amount: toNumber(premiumDiscount?.amount),
        },
        vat: {
          percentage: toNumber(vat?.rate),
          amount: toNumber(vat?.amount),
        },
        itemTotal: {
          baseAmount: toNumber(itemTotal?.baseAmount),
          makingChargesTotal: toNumber(itemTotal?.makingChargesTotal),
          premiumTotal: toNumber(itemTotal?.premiumTotal),
          subTotal: toNumber(itemTotal?.subTotal),
          vatAmount: toNumber(itemTotal?.vatAmount),
          itemTotalAmount: toNumber(itemTotal?.itemTotalAmount),
        },
        remarks: trim(remarks) || "",
      };
    });

    // === MAP OTHER CHARGES ===
    const mappedOtherCharges = otherCharges.map((charge) => {
      if (!charge.code || !charge.debit || !charge.credit) {
        throw createAppError("Invalid otherCharges structure", 400);
      }
      return {
        code: trim(charge.code),
        description: trim(charge.description) || "",
        percentage: toNumber(charge.percentage),
        debit: {
          account: trim(charge.debit.account),
          baseCurrency: toNumber(charge.debit.baseCurrency),
          foreignCurrency: toNumber(charge.debit.foreignCurrency),
          currency: trim(charge.debit.currency),
        },
        credit: {
          account: trim(charge.credit.account),
          baseCurrency: toNumber(charge.credit.baseCurrency),
          foreignCurrency: toNumber(charge.credit.foreignCurrency),
          currency: trim(charge.credit.currency),
        },
        vatDetails: charge.vatDetails
          ? {
              vatNo: trim(charge.vatDetails.vatNo) || "",
              invoiceNo: trim(charge.vatDetails.invoiceNo),
              invoiceDate: toDate(charge.vatDetails.invoiceDate),
              vatRate: toNumber(charge.vatDetails.vatRate),
              vatAmount: toNumber(charge.vatDetails.vatAmount),
            }
          : null,
          remarks: trim(charge.remarks) || "",
      };
    });

    
    // === FINAL TRANSACTION DATA ===
    const transactionData = {
      transactionType,
      fixed: Boolean(fix),
      unfix: Boolean(unfix),
      partyCode: trim(partyCode),
      partyCurrency: trim(partyCurrency),
      itemCurrency: trim(itemCurrency),
      partyCurrencyRate: toNumber(partyCurrencyRate, 1),
      voucherType,
      voucherDate: toDate(voucherDate) || new Date(),
      voucherNumber: trim(voucherNumber),
      supplierInvoiceNo: trim(supplierInvoiceNo),
      supplierDate: toDate(supplierDate),
      metalRateUnit: metalRateUnit
        ? {
            rateType: trim(metalRateUnit.rateType),
            rate: toNumber(metalRateUnit.rate),
            rateInGram: toNumber(metalRateUnit.rateInGram),
          }
        : null,
      stockItems: mappedStockItems,
      otherCharges: mappedOtherCharges,
      totalSummary : {
        itemSubTotal: toNumber(totalSummary?.itemSubTotal) || 0,
        itemTotalVat: toNumber(totalSummary?.itemTotalVat) || 0,
        itemTotalAmount: toNumber(totalSummary?.itemTotalAmount) || 0,
        totalOtherCharges: toNumber(totalSummary?.totalOtherCharges) || 0,
        totalOtherChargesVat: toNumber(totalSummary?.totalOtherChargesVat) || 0,
        netAmount: toNumber(totalSummary?.netAmount) || 0,
        rounded: toNumber(totalSummary?.rounded) || 0,
        totalAmount: toNumber(totalSummary?.totalAmount) || 0
      },
      enteredBy: trim(enteredBy),
      salesman: trim(salesman),
      status,
      notes: trim(notes),
    };

    // === CREATE IN SERVICE ===
    const metalTransaction =
      await MetalTransactionService.createMetalTransaction(
        transactionData,
        req.admin.id
      );

    // === INVENTORY UPDATE ===
    if (["purchase", "saleReturn"].includes(transactionType)) {
      await InventoryService.updateInventory(metalTransaction, false); // add
    } else if (["sale", "purchaseReturn"].includes(transactionType)) {
      await InventoryService.updateInventory(metalTransaction, true); // deduct
    }

    res.status(201).json({
      success: true,
      message: `Metal ${transactionType} created successfully`,
      data: metalTransaction,
    });
  } catch (error) {
    console.error("CREATE ERROR:", error);
    next(error);
  }
};

// ======================== UPDATE METAL TRANSACTION ========================
export const updateMetalTransaction = async (req, res, next) => {
  let id;
  try {
    id = req.params?.id;
    const body = req.body || {};

    if (!id) throw createAppError("Transaction ID required", 400, "MISSING_ID");
    if (!req.admin?.id)
      throw createAppError("Unauthorized", 401, "UNAUTHORIZED");

    const {
      transactionType,
      hedge,
      partyCode,
      partyCurrency,
      itemCurrency,
      partyCurrencyRate,
      voucherType,
      voucherDate,
      voucherNumber,
      supplierInvoiceNo,
      supplierDate,
      metalRateUnit,
      stockItems = [],
      otherCharges = [],
      netAmount = 0,
      rounded = 0,
      totalAmount = 0,
      enteredBy,
      salesman,
      status = "draft",
      notes,
    } = body;

    // Required fields
    const required = ["transactionType", "partyCode", "stockItems"];
    const missing = required.filter((f) => !body[f]);
    if (missing.length)
      throw createAppError(`Missing: ${missing.join(", ")}`, 400);

    if (!Array.isArray(stockItems) || stockItems.length === 0) {
      throw createAppError("stockItems must be non-empty array", 400);
    }

    const mappedStockItems = stockItems.map((item) => ({
      stockCode: trim(item.stockCode),
      description: trim(item.description) || "",
      grossWeight: toNumber(item.grossWeight),
      purityStd: toNumber(item.purityStd, 0.999),
      purity: toNumber(item.purity),
      pureWeightStd: toNumber(item.pureWeightStd),
      pureWeight: toNumber(item.pureWeight),
      purityDifference: toNumber(item.purityDifference),
      weightInOz: toNumber(item.weightInOz),
      metalRate:metalRateUnit?.rateType || null,
      metalRateRequirements: {
        rate: toNumber(item.metalRate?.rate),
        rateInGram: toNumber(item.metalRate?.rateInGram),
      },
      metalAmount: toNumber(item.itemTotal?.baseAmount),
      makingUnit: {
        unit: item.makingUnit?.unit || "percentage",
        makingRate: toNumber(item.makingUnit?.makingRate),
        makingAmount: toNumber(item.makingUnit?.makingAmount),
      },
      premiumDiscount: {
        rate: toNumber(item["premium-discount"]?.rate),
        amount: toNumber(item["premium-discount"]?.amount),
      },
      vat: {
        rate: toNumber(item.vat?.rate),
        amount: toNumber(item.vat?.amount),
      },
      itemTotal: {
        baseAmount: toNumber(item.itemTotal?.baseAmount),
        makingChargesTotal: toNumber(item.itemTotal?.makingChargesTotal),
        premiumTotal: toNumber(item.itemTotal?.premiumTotal),
        subTotal: toNumber(item.itemTotal?.subTotal),
        vatAmount: toNumber(item.itemTotal?.vatAmount),
        itemTotalAmount: toNumber(item.itemTotal?.itemTotalAmount),
      },
      remarks: trim(item.remarks) || "",
    }));

    const mappedOtherCharges = (otherCharges || []).map((c) => ({
      code: trim(c.code),
      description: trim(c.description) || "",
      percentage: toNumber(c.percentage),
      debit: {
        account: trim(c.debit?.account),
        baseCurrency: toNumber(c.debit?.baseCurrency),
        foreignCurrency: toNumber(c.debit?.foreignCurrency),
        currency: trim(c.debit?.currency),
      },
      credit: {
        account: trim(c.credit?.account),
        baseCurrency: toNumber(c.credit?.baseCurrency),
        foreignCurrency: toNumber(c.credit?.foreignCurrency),
        currency: trim(c.credit?.currency),
      },
      vatDetails: c.vatDetails
        ? {
            vatNo: trim(c.vatDetails.vatNo) || "",
            invoiceNo: trim(c.vatDetails.invoiceNo),
            invoiceDate: toDate(c.vatDetails.invoiceDate),
            vatRate: toNumber(c.vatDetails.vatRate),
            vatAmount: toNumber(c.vatDetails.vatAmount),
          }
        : null,
    }));

    const transactionData = {
      transactionType,
      hedge: Boolean(hedge),
      partyCode: trim(partyCode),
      partyCurrency: trim(partyCurrency),
      itemCurrency: trim(itemCurrency),
      partyCurrencyRate: toNumber(partyCurrencyRate, 1),
      voucherType,
      voucherDate: toDate(voucherDate),
      voucherNumber: trim(voucherNumber),
      supplierInvoiceNo: trim(supplierInvoiceNo),
      supplierDate: toDate(supplierDate),
      metalRateUnit: metalRateUnit
        ? {
            rateType: trim(metalRateUnit.rateType),
            rate: toNumber(metalRateUnit.rate),
            rateInGram: toNumber(metalRateUnit.rateInGram),
          }
        : undefined,
      stockItems: mappedStockItems,
      otherCharges: mappedOtherCharges,
      netAmount: toNumber(netAmount),
      rounded: toNumber(rounded),
      totalAmount: toNumber(totalAmount),
      enteredBy: trim(enteredBy),
      salesman: trim(salesman),
      status,
      notes: trim(notes),
    };
console.log(transactionData)
    const updated = await MetalTransactionService.updateMetalTransaction(
      id,
      transactionData,
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Transaction updated",
      data: updated,
    });
  } catch (error) {
    console.error(`UPDATE ERROR [ID: ${id}]:`, error);
    next(error);
  }
};

// ======================== OTHER ENDPOINTS (UNCHANGED LOGIC) ========================

export const getAllMetalTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      transactionType,
      partyCode,
      status,
      startDate,
      endDate,
      stockCode,
      voucherType,
    } = req.query;

    const filters = {};
    if (transactionType) filters.transactionType = transactionType;
    if (partyCode) filters.partyCode = partyCode;
    if (status) filters.status = status;
    if (voucherType) filters.voucherType = voucherType;
    if (stockCode) filters["stockItems.stockCode"] = stockCode;
    if (startDate || endDate) {
      filters.voucherDate = {};
      if (startDate) filters.voucherDate.$gte = new Date(startDate);
      if (endDate) filters.voucherDate.$lte = new Date(endDate);
    }

    const result = await MetalTransactionService.getAllMetalTransactions(
      parseInt(page, 10),
      parseInt(limit, 10),
      filters
    );

    res.status(200).json({
      success: true,
      message: "Transactions retrieved",
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getMetalTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createAppError("ID required", 400);

    const transaction = await MetalTransactionService.getMetalTransactionById(
      id
    );
    res
      .status(200)
      .json({ success: true, message: "Found", data: transaction });
  } catch (error) {
    next(error);
  }
};

export const deleteMetalTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw createAppError("ID required", 400);

    const result = await MetalTransactionService.deleteMetalTransaction(
      id,
      req.admin.id
    );
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    next(error);
  }
};

export const getMetalTransactionsByParty = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { limit = 50, transactionType } = req.query;
    if (!partyId) throw createAppError("Party ID required", 400);

    const transactions = await MetalTransactionService.getTransactionsByParty(
      partyId,
      parseInt(limit, 10),
      transactionType
    );

    res
      .status(200)
      .json({ success: true, message: "By party", data: transactions });
  } catch (error) {
    next(error);
  }
};

export const getTransactionStatistics = async (req, res, next) => {
  try {
    const { transactionType, partyCode, startDate, endDate } = req.query;
    const filters = { transactionType, partyCode, startDate, endDate };
    Object.keys(filters).forEach((k) => !filters[k] && delete filters[k]);

    const stats = await MetalTransactionService.getTransactionStatistics(
      filters
    );
    res.status(200).json({ success: true, message: "Stats", data: stats });
  } catch (error) {
    next(error);
  }
};

export const updateTransactionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!id || !status) throw createAppError("ID & status required", 400);

    const updated = await MetalTransactionService.updateMetalTransaction(
      id,
      { status },
      req.admin.id
    );

    res
      .status(200)
      .json({ success: true, message: "Status updated", data: updated });
  } catch (error) {
    next(error);
  }
};

export const addStockItemToTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const stockItem = req.body;
    if (!id) throw createAppError("ID required", 400);

    const updated = await MetalTransactionService.addStockItem(
      id,
      stockItem,
      req.admin.id
    );
    res
      .status(200)
      .json({ success: true, message: "Item added", data: updated });
  } catch (error) {
    next(error);
  }
};

export const updateStockItemInTransaction = async (req, res, next) => {
  try {
    const { id, stockItemId } = req.params;
    const update = req.body;
    if (!id || !stockItemId) throw createAppError("IDs required", 400);

    const updated = await MetalTransactionService.updateStockItem(
      id,
      stockItemId,
      update,
      req.admin.id
    );
    res
      .status(200)
      .json({ success: true, message: "Item updated", data: updated });
  } catch (error) {
    next(error);
  }
};

export const removeStockItemFromTransaction = async (req, res, next) => {
  try {
    const { id, stockItemId } = req.params;
    if (!id || !stockItemId) throw createAppError("IDs required", 400);

    const updated = await MetalTransactionService.removeStockItem(
      id,
      stockItemId,
      req.admin.id
    );
    res
      .status(200)
      .json({ success: true, message: "Item removed", data: updated });
  } catch (error) {
    next(error);
  }
};

export const calculateSessionTotals = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { vatPercentage = 5 } = req.body;
    if (!id) throw createAppError("ID required", 400);

    const updated =
      await MetalTransactionService.calculateAndUpdateSessionTotals(
        id,
        toNumber(vatPercentage),
        req.admin.id
      );

    res
      .status(200)
      .json({ success: true, message: "Totals calculated", data: updated });
  } catch (error) {
    next(error);
  }
};

export const getProfitLossAnalysis = async (req, res, next) => {
  try {
    const { startDate, endDate, partyCode, stockCode } = req.query;
    const filters = { startDate, endDate, partyCode, stockCode };
    Object.keys(filters).forEach((k) => !filters[k] && delete filters[k]);

    const analysis = await MetalTransactionService.getProfitLossAnalysis(
      filters
    );
    res.status(200).json({ success: true, message: "P&L", data: analysis });
  } catch (error) {
    next(error);
  }
};

export const getUnfixedTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      transactionType,
      partyCode,
      status,
      startDate,
      endDate,
    } = req.query;

    const filters = { transactionType, partyCode, status, startDate, endDate };
    Object.keys(filters).forEach((k) => !filters[k] && delete filters[k]);

    const result = await MetalTransactionService.getUnfixedTransactions(
      parseInt(page, 10),
      parseInt(limit, 10),
      filters
    );

    res.status(200).json({
      success: true,
      message: "Unfixed parties",
      data: {
        parties: result.parties.map((p) => ({
          _id: p._id,
          accountCode: p.accountCode,
          customerName: p.customerName,
          email: p.email,
          phone: p.phone,
          goldBalance: p.goldBalance,
          cashBalance: p.cashBalance,
          shortMargin: p.shortMargin,
        })),
      },
      pagination: result.pagination,
      summary: result.summary,
    });
  } catch (error) {
    next(error);
  }
};

export const getUnfixedTransactionsWithAccounts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      transactionType,
      partyCode,
      status,
      startDate,
      endDate,
    } = req.query;

    const filters = { transactionType, partyCode, status, startDate, endDate };
    if (req.user?.id) filters.partyCode = req.user.id;
    Object.keys(filters).forEach((k) => !filters[k] && delete filters[k]);

    const result =
      await MetalTransactionService.getUnfixedTransactionsWithAccounts(
        parseInt(page, 10),
        parseInt(limit, 10),
        filters
      );

    res.status(200).json({
      success: true,
      message: "Unfixed with accounts",
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};
