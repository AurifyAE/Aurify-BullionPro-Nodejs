import { TransactionFixingService } from "../../services/modules/TransactionFixingService.js";
import { createAppError } from "../../utils/errorHandler.js";

const VALID_TYPES = ["PURCHASE", "SALE", "PURCHASE-FIXING", "SALE-FIXING"];
const DEFAULT_PREFIX = "PF";
const DEFAULT_SALESMAN = "N/A";
const DEFAULT_PAYMENT_TERMS = "Cash";

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
    if (isNaN(o.grossWeight) || o.grossWeight <= 0)
      throw createAppError(`Order ${i + 1}: grossWeight must be >0`, 400);
    if (isNaN(o.oneGramRate) || o.oneGramRate <= 0)
      throw createAppError(`Order ${i + 1}: oneGramRate must be >0`, 400);
    if (isNaN(o.price) || o.price <= 0)
      throw createAppError(`Order ${i + 1}: price must be >0`, 400);
  });
};

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

    const transactionData = {
      partyId: partyId?.trim(),
      type: type?.toUpperCase(),
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
      orders: (orders || []).map((o) => ({
        commodity: o.commodity,
        commodityValue: Number(o.commodityValue) || 0,
        commodityPiece: Number(o.commodityPiece) || 0,
        itemCurrencyRate: Number(o.itemCurrencyRate),
        grossWeight: Number(o.grossWeight),
        oneGramRate: Number(o.oneGramRate),
        selectedCurrencyId: o.selectedCurrencyId||"",
        ozWeight: Number(o.ozWeight) || 0,
        currentBidValue: Number(o.currentBidValue),
        bidValue: Number(o.bidValue),
        pureWeight: Number(o.pureWeight),
        selectedCurrencyId: o.selectedCurrencyId,
        purity: Number(o.purity),
        remarks: o.remarks?.trim() || "",
        price: +o.price,
        metalType: o.metalType,
      })),
    };

    validateTransactionData(transactionData);

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
        if (f === "invoiceDate" || f === "voucherDate") {
          updateData[f] = payload[f] ? new Date(payload[f]) : null;
        } else {
          updateData[f] = payload[f];
          if (typeof payload[f] === "string") updateData[f] = payload[f].trim();
        }
      }
    });

    // Normalise orders the same way as create
    if (updateData.orders) {
      updateData.orders = updateData.orders.map((o) => ({
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
        purity: Number(o.purity),
        remarks: o.remarks?.trim() || "",
        price: o.price?.toString(),
        metalType: o.metalType,
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
