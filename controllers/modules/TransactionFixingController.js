import { TransactionFixingService } from "../../services/modules/TransactionFixingService.js";
import { createAppError } from "../../utils/errorHandler.js";

const VALID_TYPES = ["PURCHASE", "SALE", "PURCHASE-FIXING", "SALE-FIXING"];
const DEFAULT_PREFIX = "PF";
const DEFAULT_SALESMAN = "N/A";
const DEFAULT_PAYMENT_TERMS = "Cash";

/* ---------------------------------------------------------
   FX LOGIC — MARKET VALUE & GIVEN VALUE ALREADY COMING
   FROM FRONTEND. HERE WE ONLY CALCULATE GAIN / LOSS.
----------------------------------------------------------*/
const buildForexValue = (txnType = "", raw = {}) => {
  const upperType = txnType.toUpperCase();

  const purchaseRate = Number(raw.purchaseRate) || 0;
  const sellRate = Number(raw.sellRate) || 0;
  const defaultRate = Number(raw.defaultRate) || 0;
  const marketValue = Number(raw.marketValue) || 0; // already from FE
  const givenValue = Number(raw.givenValue) || 0; // already from FE

  let diff = 0;

  if (upperType.startsWith("PURCHASE")) {
    diff = marketValue - givenValue; // purchase logic
  } else if (upperType.startsWith("SALE")) {
    diff = givenValue - marketValue; // sale logic
  }

  return {
    purchaseRate,
    sellRate,
    defaultRate,
    marketValue,
    givenValue,
    fxGain: diff > 0 ? diff : 0,
    fxLoss: diff < 0 ? Math.abs(diff) : 0,
  };
};

/* ---------------------------------------------------------
   VALIDATION
----------------------------------------------------------*/
const validateTransactionData = (data, isUpdate = false) => {
  if (!isUpdate && !data.partyId) {
    throw createAppError(
      "Party ID is required",
      400,
      "REQUIRED_FIELDS_MISSING"
    );
  }

  if (data.type && !VALID_TYPES.includes(data.type.toUpperCase())) {
    throw createAppError(
      `Type must be one of: ${VALID_TYPES.join(", ")}`,
      400,
      "INVALID_TYPE"
    );
  }

  if (data.orders && !Array.isArray(data.orders)) {
    throw createAppError(
      "Orders must be an array",
      400,
      "INVALID_ORDERS_FORMAT"
    );
  }

  data.orders?.forEach((o, i) => {
    if (!o.commodity)
      throw createAppError(`Order ${i + 1}: commodity required`, 400);

    if (!o.forexValue)
      throw createAppError(`Order ${i + 1}: forexValue required`, 400);

    if (isNaN(o.forexValue.marketValue) || isNaN(o.forexValue.givenValue)) {
      throw createAppError(
        `Order ${i + 1}: marketValue and givenValue must be numbers`,
        400
      );
    }
  });
};

/* ---------------------------------------------------------
   CREATE TRANSACTION
----------------------------------------------------------*/
export const createTransaction = async (req, res, next) => {
  try {
    const {
      partyId,
      type,
      referenceNumber,
      invoiceReferenceNumber,
      invoiceDate,
      voucherCode,
      voucherType,
      voucherDate,
      prefix = DEFAULT_PREFIX,
      partyPhone,
      partyEmail,
      salesman = DEFAULT_SALESMAN,
      orders,
    } = req.body;

    const upperType = type?.toUpperCase();

    const formattedOrders = (orders || []).map((o) => ({
      commodity: o.commodity,
      commodityValue: Number(o.commodityValue) || 0,
      commodityPiece: Number(o.commodityPiece) || 0,
      itemCurrencyRate: Number(o.itemCurrencyRate),
      grossWeight: Number(o.grossWeight),
      oneGramRate: Number(o.oneGramRate),
      ozWeight: Number(o.ozWeight) || 0,
      currentBidValue: Number(o.currentBidValue),
      currencyCode:o.currencyCode,
      bidValue: Number(o.bidValue),
      pureWeight: Number(o.pureWeight),
      selectedCurrencyId: o.selectedCurrencyId || "",
      partyCurrencyId: o.partyCurrencyId || null,
      partyCurrencyRate: o.partyCurrencyRate ? Number(o.partyCurrencyRate) : null,
      purity: Number(o.purity),
      remarks: o.remarks?.trim() || "",
      price: +o.price,
      metalType: o.metalType,
      forexValue: buildForexValue(upperType, o.forexValue || {}),
    }));

    const transactionData = {
      partyId: partyId?.trim(),
      type: upperType,
      referenceNumber: referenceNumber?.trim(),
      invoiceReferenceNumber: invoiceReferenceNumber?.trim(),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      voucherNumber: voucherCode || null,
      voucherType: voucherType?.trim(),
      voucherDate: voucherDate ? new Date(voucherDate) : null,
      prefix: prefix?.trim(),
      partyPhone: partyPhone?.trim() || "N/A",
      partyEmail: partyEmail?.trim() || "N/A",
      salesman: salesman?.trim() || DEFAULT_SALESMAN,
      orders: formattedOrders,
    };

    validateTransactionData(transactionData);

    console.log(transactionData)
    console.log(transactionData.orders[0].forexValue)
    const transaction = await TransactionFixingService.createTransaction(
      transactionData,
      req.admin.id
    );

    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
};

export const getAllTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      type = "",
      metalType = "",
      partyId = "",
    } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    if (isNaN(parsedPage) || parsedPage < 1) {
      throw createAppError("Invalid page number", 400, "INVALID_PAGE");
    }

    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw createAppError("Invalid limit value", 400, "INVALID_LIMIT");
    }

    const result = await TransactionFixingService.getAllTransactions(
      parsedPage,
      parsedLimit,
      search.trim(),
      status,
      type.toUpperCase(),
      metalType.trim(),
      partyId.trim()
    );

    res.status(200).json({
      success: true,
      message: "Transactions retrieved successfully",
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id?.trim()) {
      throw createAppError("Transaction ID is required", 400, "MISSING_ID");
    }

    const transaction = await TransactionFixingService.getTransactionById(
      id.trim()
    );

    res.status(200).json({
      success: true,
      message: "Transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payload = req.body;

    if (!id?.trim())
      throw createAppError("Transaction ID required", 400, "MISSING_ID");

    const updateData = {};
    const fields = [
      "partyId",
      "type",
      "referenceNumber",
      "invoiceReferenceNumber",
      "invoiceDate",
      "voucherNumber",
      "voucherType",
      "voucherDate",
      "prefix",
      "partyPhone",
      "partyEmail",
      "salesman",
      "orders",
    ];

    fields.forEach((f) => {
      if (payload[f] !== undefined) {
        updateData[f] =
          f === "invoiceDate" || f === "voucherDate"
            ? payload[f]
              ? new Date(payload[f])
              : null
            : typeof payload[f] === "string"
            ? payload[f].trim()
            : payload[f];
      }
    });

    if (updateData.orders) {
      const txnType = updateData.type || payload.type;

      updateData.orders = updateData.orders.map((o) => ({
        ...o,
        commodity: o.commodity,
        commodityValue: Number(o.commodityValue) || 0,
        commodityPiece: Number(o.commodityPiece) || 0,
        itemCurrencyRate: Number(o.itemCurrencyRate),
        grossWeight: Number(o.grossWeight),
        oneGramRate: Number(o.oneGramRate),
        ozWeight: Number(o.ozWeight) || 0,
        currentBidValue: Number(o.currentBidValue),
        bidValue: Number(o.bidValue),
        pureWeight: Number(o.pureWeight),
        selectedCurrencyId: o.selectedCurrencyId,
        partyCurrencyId: o.partyCurrencyId || null,
        partyCurrencyRate: o.partyCurrencyRate ? Number(o.partyCurrencyRate) : null,
        purity: Number(o.purity),
        remarks: o.remarks?.trim() || "",
        price: o.price?.toString(),
        metalType: o.metalType,

        forexValue: buildForexValue(txnType, o.forexValue || {}),
      }));
    }

    validateTransactionData(updateData, true);

    if (Object.keys(updateData).length === 0)
      throw createAppError("No fields to update", 400, "NO_UPDATE_FIELDS");

    const transaction = await TransactionFixingService.updateTransaction(
      id.trim(),
      updateData,
      req.admin.id
    );

    res.json({
      success: true,
      message: "Transaction updated successfully",
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id?.trim()) {
      throw createAppError("Transaction ID is required", 400, "MISSING_ID");
    }

    const deletedTransaction = await TransactionFixingService.deleteTransaction(
      id.trim(),
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Transaction deleted successfully",
      data: deletedTransaction,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id?.trim()) {
      throw createAppError("Transaction ID is required", 400, "MISSING_ID");
    }

    const transaction = await TransactionFixingService.cancelTransaction(
      id.trim(),
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Transaction cancelled successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

export const permanentDeleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id?.trim()) {
      throw createAppError("Transaction ID is required", 400, "MISSING_ID");
    }

    const result = await TransactionFixingService.permanentDeleteTransaction(
      id.trim()
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export const restoreTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id?.trim()) {
      throw createAppError("Transaction ID is required", 400, "MISSING_ID");
    }

    const transaction = await TransactionFixingService.restoreTransaction(
      id.trim(),
      req.admin.id
    );

    res.status(200).json({
      success: true,
      message: "Transaction restored successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionsByParty = async (req, res, next) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate } = req.query;

    if (!partyId?.trim()) {
      throw createAppError("Party ID is required", 400, "MISSING_PARTY_ID");
    }

    const transactions = await TransactionFixingService.getTransactionsByParty(
      partyId.trim(),
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      message: "Party transactions retrieved successfully",
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionsByMetal = async (req, res, next) => {
  try {
    const { metalType } = req.params;
    const { startDate, endDate } = req.query;

    if (!metalType?.trim()) {
      throw createAppError("Metal type is required", 400, "MISSING_METAL_TYPE");
    }

    const transactions = await TransactionFixingService.getTransactionsByMetal(
      metalType.trim(),
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      message: "Metal transactions retrieved successfully",
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

export const getPartyMetalSummary = async (req, res, next) => {
  try {
    const { partyId, metalType } = req.params;

    if (!partyId?.trim() || !metalType?.trim()) {
      throw createAppError(
        "Party ID and Metal type are required",
        400,
        "MISSING_PARAMETERS"
      );
    }

    const summary = await TransactionFixingService.getPartyMetalSummary(
      partyId.trim(),
      metalType.trim()
    );

    res.status(200).json({
      success: true,
      message: "Party metal summary retrieved successfully",
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};
