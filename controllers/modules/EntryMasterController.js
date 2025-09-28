import Entry from "../../models/modules/EntryModel.js";
import Registry from "../../models/modules/Registry.js";
import AccountType from "../../models/modules/AccountType.js";
import AccountMaster from "../../models/modules/accountMaster.js";
import InventoryService from "../../services/modules/inventoryService.js";
import RegistryService from "../../services/modules/RegistryService.js";
import AccountLog from "../../models/modules/AccountLog.js";
import { createAppError } from "../../utils/errorHandler.js";
import CurrencyMaster from "../../models/modules/CurrencyMaster.js";
import InventoryLog from "../../models/modules/InventoryLog.js";
import Inventory from "../../models/modules/inventory.js";

const createEntry = async (req, res) => {
  try {
    const { type, stocks, cash } = req.body;
    const stockItems = stocks;
    // Validate entry type
    const validTypes = [
      "metal-receipt",
      "metal-payment",
      "cash receipt",
      "cash payment",
      "currency-receipt",
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entry type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate required fields based on type
    if (["metal-receipt", "metal-payment"].includes(type)) {
      if (
        !stockItems ||
        !Array.isArray(stockItems) ||
        stockItems.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "stockItems array is required and must not be empty for metal entries",
        });
      }
      if (cash && Array.isArray(cash) && cash.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cash array should not be provided for metal entries",
        });
      }
      // Validate stock field in stockItems
      for (const item of stockItems) {
        if (!item.stock) {
          return res.status(400).json({
            success: false,
            message: "Each stockItem must include a valid stock field",
          });
        }
      }
    } else if (["cash receipt", "cash payment"].includes(type)) {
      if (!cash || !Array.isArray(cash) || cash.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cash array is required and must not be empty for cash entries",
        });
      }
      if (stockItems && Array.isArray(stockItems) && stockItems.length > 0) {
        return res.status(400).json({
          success: false,
          message: "stockItems array should not be provided for cash entries",
        });
      }
    }

    // Prepare entry data
    const entryData = {
      type,
      voucherCode: req.body.voucherCode,
      voucherDate: req.body.voucherDate,
      party: req.body.party,
      enteredBy: req.admin.id,
      remarks: req.body.remarks,
      // Only include relevant fields based on type
      ...(type.includes("metal") ? { stockItems } : {}),
      ...(type.includes("cash") ? { cash } : {}),
    };


    const entry = new Entry(entryData);

    // Handle specific entry types
    const handlers = {
      "metal-receipt": handleMetalReceipt,
      "metal-payment": handleMetalPayment,
      "cash receipt": handleCashReceipt,
      "cash payment": handleCashPayment,
    };

    if (handlers[type]) {
      await handlers[type](entry);
    }

    // Save entry
    await entry.save();

    res.status(201).json({
      success: true,
      data: entry,
      message: `${type} entry created successfully`,
    });
  } catch (err) {
    console.error("Error creating entry:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

const editEntry = async (req, res) => {
  try {
    const { type, stocks, cash, voucherCode } = req.body;
    const stockItems = stocks;

    // Validate entry type
    const validTypes = [
      "metal-receipt",
      "metal-payment",
      "cash receipt",
      "cash payment",
      "currency-receipt",
    ];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid entry type. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate required fields based on type
    if (["metal-receipt", "metal-payment"].includes(type)) {
      if (!stockItems || !Array.isArray(stockItems) || stockItems.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "stockItems array is required and must not be empty for metal entries",
        });
      }
      if (cash && Array.isArray(cash) && cash.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Cash array should not be provided for metal entries",
        });
      }
      for (const item of stockItems) {
        if (!item.stock) {
          return res.status(400).json({
            success: false,
            message: "Each stockItem must include a valid stock field",
          });
        }
      }
    } else if (["cash receipt", "cash payment"].includes(type)) {
      if (!cash || !Array.isArray(cash) || cash.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cash array is required and must not be empty for cash entries",
        });
      }
      if (stockItems && Array.isArray(stockItems) && stockItems.length > 0) {
        return res.status(400).json({
          success: false,
          message: "stockItems array should not be provided for cash entries",
        });
      }
    }

    // First, delete related registry records
    await RegistryService.deleteRegistryByVoucher(voucherCode);

    // Find the existing entry
    const entry = await Entry.findOne({ voucherCode });
    let oldentry = await Entry.findOne({ voucherCode });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found for the given voucherCode",
      });
    }

    // Update fields
    entry.type = type;
    entry.voucherDate = req.body.voucherDate;
    entry.party = req.body.party;
    entry.enteredBy = req.admin.id;
    entry.remarks = req.body.remarks;

    if (type.includes("metal")) {
      entry.stockItems = stockItems;
      entry.cash = [];
    } else if (type.includes("cash")) {
      entry.cash = cash;
      entry.stockItems = [];
    }

    // minus the old balance of account and account master if any
    const originalData = entry.toObject();
    const oldParty = originalData.party;
    const newParty = req.body.party;
    const isPartyChanged = oldParty !== newParty;

    // minus the old balances from party account
    let party = null;
    if (isPartyChanged) {
      party = oldParty;
    } else {
      party = newParty;
    }

    if (["cash receipt", "cash payment"].includes(type)) {

      const result = await AccountLog.deleteMany({ reference: voucherCode });
      console.log(`Deleted ${result.deletedCount} account log entries for voucherCode ${voucherCode}`);
      await reverseAccountBalances(party, oldentry, entry);

    } else {
      // delte the inventory log entries
      const InventoryLogResult = await InventoryLog.deleteMany({ voucherCode: voucherCode });
      // edit the user account and invertory
      console.log(`Deleted ${InventoryLogResult.deletedCount} inventory log entries for voucherCode ${voucherCode}`);
      await reverseAccountGoldBalances(party, oldentry, entry);
    }



    // Handle specific entry types
    const handlers = {
      "metal-receipt": handleMetalReceipt,
      "metal-payment": handleMetalPayment,
      "cash receipt": handleCashReceipt,
      "cash payment": handleCashPayment,
    };

    if (handlers[type]) {
      await handlers[type](entry);
    }

    // Save updated entry
    await entry.save();

    return res.status(200).json({
      success: true,
      data: entry,
      message: `${type} entry edit successfully completed`,
    });
  } catch (err) {
    console.error("Error editing entry:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

const reverseAccountBalances = async (partyId, originalData, entry) => {
  // Fetch account
  const account = await AccountType.findOne({ _id: partyId });

  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  for (const cashItem of originalData.cash) {
    // Validate cash item
    if (!cashItem?.cashType || !cashItem?.amount || !cashItem?.currency) {
      throw createAppError("Invalid cash item data", 400, "INVALID_CASH_ITEM");
    }

    const transactionId = await Registry.generateTransactionId();
    const cashAccount = await AccountMaster.findOne({ _id: cashItem.cashType });


    if (!cashAccount) {
      throw createAppError(
        `Cash type account not found for ID: ${cashItem.cashType}`,
        404,
        "CASH_TYPE_NOT_FOUND"
      );
    }

    account.balances.cashBalance = account.balances.cashBalance || {
      currency: cashItem.currency,
      amount: 0,
      lastUpdated: new Date(),
    };

    // Calculate new balances
    const amount = Number(cashItem.amount) || 0;
    if (amount <= 0) {
      throw createAppError("Amount must be positive", 400, "INVALID_AMOUNT");
    }

    let balanceAfter;
    const previousBalance = account.balances.cashBalance.amount || 0;

    if (previousBalance < 0) {
      // if balance is already negative → move towards zero
      balanceAfter = previousBalance + amount;
    } else {
      // normal subtraction when balance is positive
      balanceAfter = previousBalance - amount;
    }

    // Update balances
    account.balances.cashBalance.amount = balanceAfter;
    account.balances.cashBalance.lastUpdated = new Date();


    if (cashAccount.openingBalance < 0) {
      cashAccount.openingBalance = cashAccount.openingBalance + amount;
    } else {
      cashAccount.openingBalance = (cashAccount.openingBalance || 0) - amount;
    }

    await cashAccount.save();
  }

  await account.save();
  return account;
};

const reverseAccountGoldBalances = async (partyId, originalData) => {
  // Fetch account
  const account = await AccountType.findOne({ _id: originalData.party });
  


  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Validate stock items
  for (const stock of originalData.stockItems) {
    if (!stock?.stock || !stock?.purity || !stock?.grossWeight || !stock?.purityWeight) {
      throw createAppError("Invalid stock item data", 400, "INVALID_STOCK_ITEM");
    }
  }

  // Ensure balance object exists
  account.balances.goldBalance = account.balances.goldBalance || {
    totalGrams: 0,
    lastUpdated: new Date(),
  };

  const previousBalance = account.balances.goldBalance.totalGrams || 0;

  // ✅ Calculate total reduction from all stock items
  const totalReduction = originalData.stockItems.reduce((sum, stock) => {
    return sum + (stock.purityWeight || 0); // or stock.grossWeight if needed
  }, 0);



  // Reduce from account
  // Reduce from account (handle negatives correctly)
  if (previousBalance < 0) {
    account.balances.goldBalance.totalGrams = previousBalance + totalReduction;
  } else {
    account.balances.goldBalance.totalGrams = previousBalance - totalReduction;
  }

  account.balances.goldBalance.lastUpdated = new Date();


  await account.save();
  return account;
};

const handleMetalReceipt = async (entry) => {

  // update the users account balances
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }


  for (const stockItem of entry.stockItems) {

    // Initialize account balances
    account.balances = account.balances || {}
    // UPDATE BALANCES
    account.balances.goldBalance = account.balances.goldBalance || {
      totalGrams: 0,
      lastUpdated: new Date(),
    };

    const previousBalance = account.balances.goldBalance.totalGrams || 0;

    account.balances.goldBalance.totalGrams = previousBalance + stockItem.purityWeight;

    account.balances.goldBalance.lastUpdated = new Date();

    const transactionId = await Registry.generateTransactionId();
    const description =
      stockItem.remarks?.trim() || "Metal receipt transaction";

    // Create GOLD_STOCK registry entry
    await Registry.create({
      transactionId,
      EntryTransactionId: entry._id,
      type: "GOLD_STOCK",
      description,
      value: stockItem.grossWeight,
      credit: stockItem.grossWeight,
      reference: entry.voucherCode || "",
      createdBy: entry.enteredBy,
      party: null,
      isBullion: true,
      purity: stockItem.purity,
      grossWeight: stockItem.grossWeight,
      pureWeight: stockItem.purityWeight,
    });

    // Create GOLD registry entry
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId: entry._id,
      type: "GOLD",
      description,
      value: stockItem.purityWeight,
      debit: stockItem.purityWeight,
      reference: entry.voucherCode || "",
      createdBy: entry.enteredBy,
      party: null,
      isBullion: true,
      purity: stockItem.purity,
      grossWeight: stockItem.grossWeight,
      pureWeight: stockItem.purityWeight,
    });

    // Update inventory
    await InventoryService.updateInventory(
      {
        stockItems: [
          {
            stockCode: {
              _id: stockItem.stock,
              code: stockItem.stock.toString(),
            },
            pieces: stockItem.pieces || 0,
            grossWeight: stockItem.grossWeight,
            purity: stockItem.purity,
            voucherNumber: entry.voucherCode,
            transactionType: "metalReceipt"
          },
        ],
      },
      false,
      entry.enteredBy, // ← this should be a valid user ID
    );
  }
  await account.save();
};

const handleCashReceipt = async (entry) => {

  // Validate entry object
  if (!entry?.party || !entry?.cash || !Array.isArray(entry.cash)) {
    throw createAppError("Invalid entry data", 400, "INVALID_ENTRY");
  }

  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }


  // Process each cash item
  for (const cashItem of entry.cash) {
    // Validate cash item
    if (!cashItem?.cashType || !cashItem?.amount || !cashItem?.currency) {
      throw createAppError("Invalid cash item data", 400, "INVALID_CASH_ITEM");
    }

    const transactionId = await Registry.generateTransactionId();
    const cashAccount = await AccountMaster.findOne({ _id: cashItem.cashType });
    if (!cashAccount) {
      throw createAppError(
        `Cash type account not found for ID: ${cashItem.cashType}`,
        404,
        "CASH_TYPE_NOT_FOUND"
      );
    }

    // Initialize account balances
    account.balances = account.balances || {};
    account.balances.cashBalance = account.balances.cashBalance || {
      currency: cashItem.currency,
      amount: 0,
      lastUpdated: new Date(),
    };

    // Calculate new balances
    const amount = Number(cashItem.amount) || 0;
    if (amount <= 0) {
      throw createAppError("Amount must be positive", 400, "INVALID_AMOUNT");
    }
    const previousBalance = account.balances.cashBalance.amount || 0;
    const balanceAfter = previousBalance + amount;

    // Update balances
    account.balances.cashBalance.amount = balanceAfter;
    account.balances.cashBalance.lastUpdated = new Date();
    cashAccount.openingBalance = (cashAccount.openingBalance || 0) + amount;

    // Create registry entries
    const description = cashItem.remarks?.trim() || entry.remarks?.trim() || "Cash receipt";
    const registryEntries = [
      {
        transactionId,
        type: "PARTY_CASH_BALANCE",
        description,
        value: amount,
        credit: amount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: entry.party?.toString(),
        isBullion: false,
      },
      {
        transactionId: await Registry.generateTransactionId(),
        type: "CASH",
        description,
        value: amount,
        debit: amount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: null,
        isBullion: true,
      },
    ];

    // 👉 If VAT exists, add extra registry entry
    if (cashItem.vatAmount && cashItem.vatAmount > 0) {
      registryEntries.push({
        transactionId: await Registry.generateTransactionId(),
        type: "VAT_AMOUNT",
        description: `VAT on cash receipt`,
        value: cashItem.vatAmount,
        debit: cashItem.vatAmount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: null,
        isBullion: false,
      });
    }
    // get the currency 
    const currency = await CurrencyMaster.findOne({ _id: cashItem.currency });
    if (!currency) {
      throw createAppError(
        `Currency not found for ID: ${cashItem.currency}`,
        404,
        "CURRENCY_NOT_FOUND"
      );
    }

    // Create account log entry
    const accountLogEntry = {
      accountId: cashItem.cashType,
      transactionType: "deposit",
      amount,
      reference: entry.voucherCode,
      balanceAfter: cashAccount.openingBalance,
      note: `Cash receipt of ${currency.currencyCode}  for account ${account.customerName}`,
      action: "add",
      transactionId,
      createdBy: entry.enteredBy,
      createdAt: new Date(),
    };

    // Save all changes in a single transaction
    await Promise.all([
      cashAccount.save(),
      account.save(),
      AccountLog.create(accountLogEntry),
      Registry.create(registryEntries),
    ]);
  }

  return account;
};

const handleCashPayment = async (entry) => {
  // Validate entry object
  if (!entry?.party || !entry?.cash || !Array.isArray(entry.cash)) {
    throw createAppError("Invalid entry data", 400, "INVALID_ENTRY");
  }

  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Process each cash item
  for (const cashItem of entry.cash) {
    // Validate cash item
    if (!cashItem?.cashType || !cashItem?.amount || !cashItem?.currency) {
      throw createAppError("Invalid cash item data", 400, "INVALID_CASH_ITEM");
    }

    const transactionId = await Registry.generateTransactionId();
    const cashAccount = await AccountMaster.findOne({ _id: cashItem.cashType });
    if (!cashAccount) {
      throw createAppError(
        `Cash type account not found for ID: ${cashItem.cashType}`,
        404,
        "CASH_TYPE_NOT_FOUND"
      );
    }

    // Initialize account balances
    account.balances = account.balances || {};
    account.balances.cashBalance = account.balances.cashBalance || {
      currency: cashItem.currency,
      amount: 0,
      lastUpdated: new Date(),
    };

    // Calculate new balances
    const amount = Number(cashItem.amount) || 0;
    if (amount <= 0) {
      throw createAppError("Amount must be positive", 400, "INVALID_AMOUNT");
    }
    const previousBalance = account.balances.cashBalance.amount || 0;
    const balanceAfter = previousBalance - amount;

    // Check for sufficient balance
    // if (balanceAfter < 0) {
    //   throw createAppError(
    //     `Insufficient balance for payment of ${amount} ${cashItem.currency}`,
    //     400,
    //     "INSUFFICIENT_BALANCE"
    //   );
    // }

    // Update balances
    account.balances.cashBalance.amount = balanceAfter;
    account.balances.cashBalance.lastUpdated = new Date();
    cashAccount.openingBalance = (cashAccount.openingBalance || 0) - amount;

    // Create registry entries
    const description = cashItem.remarks?.trim() || entry.remarks?.trim() || "Cash payment";
    const registryEntries = [
      {
        transactionId,
        type: "PARTY_CASH_BALANCE",
        description,
        value: amount,
        debit: amount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: entry.party?.toString(),
        isBullion: false,
      },
      {
        transactionId: await Registry.generateTransactionId(),
        type: "CASH",
        description,
        value: amount,
        credit: amount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: null,
        isBullion: true,
      },
    ];

    // 👉 If VAT exists, add extra registry entry
    if (cashItem.vatAmount && cashItem.vatAmount > 0) {
      registryEntries.push({
        transactionId: await Registry.generateTransactionId(),
        type: "VAT_AMOUNT",
        description: `VAT on cash payment`,
        value: cashItem.vatAmount,
        credit: cashItem.vatAmount,
        reference: entry.voucherCode || "",
        createdBy: entry.enteredBy,
        party: null,
        isBullion: false,
      });
    }

    // get the currency
    const currency = await CurrencyMaster.findOne({ _id: cashItem.currency });
    if (!currency) {
      throw createAppError(
        `Currency not found for ID: ${cashItem.currency}`,
        404,
        "CURRENCY_NOT_FOUND"
      );
    }


    // Create account log entry
    const accountLogEntry = {
      accountId: cashItem.cashType,
      transactionType: "withdrawal",
      amount,
      balanceAfter: cashAccount.openingBalance,
      note: `Cash payment of ${amount} ${currency.currencyCode} for account ${account.customerName}`,
      action: "subtract",
      transactionId,
      reference: entry.voucherCode,
      createdBy: entry.enteredBy,
      createdAt: new Date(),
    };

    // Save all changes in a single transaction
    await Promise.all([
      account.save(),
      cashAccount.save(),
      AccountLog.create(accountLogEntry),
      Registry.create(registryEntries),
    ]);
  }

  return account;
};

const handleMetalPayment = async (entry) => {
  // update the users account balances
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  for (const stockItem of entry.stockItems) {

    // Initialize account balances
    account.balances = account.balances || {}
    // UPDATE BALANCES
    account.balances.goldBalance = account.balances.goldBalance || {
      totalGrams: 0,
      lastUpdated: new Date(),
    };

    const previousBalance = account.balances.goldBalance.totalGrams || 0;

    account.balances.goldBalance.totalGrams = previousBalance - stockItem.purityWeight;

    account.balances.goldBalance.lastUpdated = new Date();


    const transactionId = await Registry.generateTransactionId();
    const description =
      stockItem.remarks?.trim() || "Metal payment transaction";

    // Create GOLD_STOCK registry entry
    await Registry.create({
      transactionId,
      EntryTransactionId: entry._id,
      type: "GOLD_STOCK",
      description,
      value: stockItem.purityWeight,
      debit: stockItem.purityWeight,
      reference: entry.voucherCode || "",
      createdBy: entry.enteredBy,
      party: null,
      isBullion: true,
      purity: stockItem.purity,
      grossWeight: stockItem.grossWeight,
      pureWeight: stockItem.purityWeight,
    });

    // Create GOLD registry entry
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId: entry._id,
      type: "GOLD",
      description,
      value: stockItem.purityWeight,
      credit: stockItem.purityWeight,
      reference: entry.voucherCode || "",
      createdBy: entry.enteredBy,
      party: null,
      isBullion: true,
    });

    // Update inventory
    await InventoryService.updateInventory(
      {
        stockItems: [
          {
            stockCode: {
              _id: stockItem.stock,
              code: stockItem.stock.toString(),
            },
            pieces: stockItem.pieces || 0,
            grossWeight: stockItem.grossWeight,
            purity: stockItem.purity,
            voucherNumber: entry.voucherCode,
            transactionType: "metalPayment"
          },
        ],
      },
      true,
      entry.enteredBy,
    );
  }
  await account.save();
};

const handleDeleteMetalReceipt = async (entry) => {
  console.log("Handling delete metal receipt for entry:", entry);

  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Ensure balance object exists
  account.balances.goldBalance = account.balances.goldBalance || {
    totalGrams: 0,
    lastUpdated: new Date(),
  };

  const previousBalance = account.balances.goldBalance.totalGrams || 0;

  // ✅ Calculate total reduction from all stock items
  const totalReduction = entry.stockItems.reduce((sum, stock) => {
    return sum + (stock.purityWeight || 0);
  }, 0);

  // Reduce from account balance
  account.balances.goldBalance.totalGrams = previousBalance - totalReduction;
  account.balances.goldBalance.lastUpdated = new Date();
  await account.save();

  // ✅ Reverse inventory update
  for (const stockItem of entry.stockItems) {
    // Fetch stock record
    const stock = await Inventory.findOne({ _id: stockItem.stock });
    if (!stock) {
      console.warn(`Stock not found for stockId: ${stockItem.stock}`);
      continue;
    }

    // Subtract pcs and/or weight
    stock.grossWeight = (stock.grossWeight || 0) - (stockItem.grossWeight || 0);
    stock.pureWeight = (stock.pureWeight || 0) - (stockItem.purityWeight || 0);

    if (stockItem.pcs) {
      stock.pcsCount = (stock.pcsCount || 0) - (stockItem.grossWeight / stock.pcsValue);
    }
    await stock.save();
  }

  // ✅ Delete inventory logs
  const result = await InventoryLog.deleteMany({ voucherCode: entry.voucherCode });
  console.log(`Deleted ${result.deletedCount} inventory log entries for voucherCode ${entry.voucherCode}`);
};


const handleDeleteMetalPayment = async (entry) => {
  console.log("Handling delete metal receipt for entry:", entry);

  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Ensure balance object exists
  account.balances.goldBalance = account.balances.goldBalance || {
    totalGrams: 0,
    lastUpdated: new Date(),
  };

  const previousBalance = account.balances.goldBalance.totalGrams || 0;

  // ✅ Calculate total reduction from all stock items
  const totalReduction = entry.stockItems.reduce((sum, stock) => {
    return sum + (stock.purityWeight || 0);
  }, 0);

  // Reduce from account balance
  account.balances.goldBalance.totalGrams = previousBalance + totalReduction;
  account.balances.goldBalance.lastUpdated = new Date();
  await account.save();

  for (const stockItem of entry.stockItems) {
    // Fetch stock record
    const stock = await Inventory.findOne({ _id: stockItem.stock });
    if (!stock) {
      console.warn(`Stock not found for stockId: ${stockItem.stock}`);
      continue;
    }

    // add pcs and/or weight
    stock.grossWeight = (stock.grossWeight || 0) + (stockItem.grossWeight || 0);
    stock.pureWeight = (stock.pureWeight || 0) + (stockItem.purityWeight || 0);

    if (stockItem.pcs) {
      stock.pcsCount = (stock.pcsCount || 0) + (stockItem.grossWeight / stock.pcsValue);
    }
    await stock.save();
  }
  const result = await InventoryLog.deleteMany({ voucherCode: entry.voucherCode });
  console.log(`Deleted ${result.deletedCount} inventory log entries for voucherCode ${entry.voucherCode}`);
};

const handleDeleteCashReceipt = async (entry) => {
  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Process each cash item to reverse balances
  for (const cashItem of entry.cash) {
    const cashAccount = await AccountMaster.findOne({ _id: cashItem.cashType });
    if (!cashAccount) {
      throw createAppError(
        `Cash type account not found for ID: ${cashItem.cashType}`,
        404,
        "CASH_TYPE_NOT_FOUND"
      );
    }

    const amount = Number(cashItem.amount) || 0;

    // Reverse balances (subtract what was added)
    if (account.balances && account.balances.cashBalance) {
      account.balances.cashBalance.amount -= amount;
      account.balances.cashBalance.lastUpdated = new Date();
    }
    cashAccount.openingBalance = (cashAccount.openingBalance || 0) - amount;

    // Save changes
    await Promise.all([
      account.save(),
      cashAccount.save(),
    ]);
  }
};

const handleDeleteCashPayment = async (entry) => {
  // Fetch account
  const account = await AccountType.findOne({ _id: entry.party });
  if (!account) {
    throw createAppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  // Process each cash item to reverse balances
  for (const cashItem of entry.cash) {
    const cashAccount = await AccountMaster.findOne({ _id: cashItem.cashType });
    if (!cashAccount) {
      throw createAppError(
        `Cash type account not found for ID: ${cashItem.cashType}`,
        404,
        "CASH_TYPE_NOT_FOUND"
      );
    }

    const amount = Number(cashItem.amount) || 0;

    // Reverse balances (add back what was subtracted)
    if (account.balances && account.balances.cashBalance) {
      account.balances.cashBalance.amount += amount;
      account.balances.cashBalance.lastUpdated = new Date();
    }
    cashAccount.openingBalance = (cashAccount.openingBalance || 0) + amount;

    // Save changes
    await Promise.all([
      account.save(),
      cashAccount.save(),
    ]);
  }
};

const getEntriesByType = async (type) => {
  return Entry.find({ type })
    .populate("voucherId")
    .populate("party")
    .populate("enteredBy")
    .populate("stockItems.stock")
    .populate("cash.cashType")
    .populate("cash.currency")
    .sort({ createdAt: -1 });
};

const getCashPayments = async (req, res) => {
  try {
    const entries = await getEntriesByType("cash payment");
    res.json(entries);
  } catch (err) {
    console.error("Error fetching cash payments:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch cash payments",
      error: err.message,
    });
  }
};

const getCashReceipts = async (req, res) => {
  try {
    const entries = await getEntriesByType("cash receipt");
    res.json(entries);
  } catch (err) {
    console.error("Error fetching cash receipts:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch cash receipts",
      error: err.message,
    });
  }
};

const getMetalPayments = async (req, res) => {
  try {
    const entries = await getEntriesByType("metal-payment");
    res.json(entries);
  } catch (err) {
    console.error("Error fetching metal payments:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch metal payments",
      error: err.message,
    });
  }
};

const getMetalReceipts = async (req, res) => {
  try {
    const entries = await getEntriesByType("metal-receipt");

    res.json(entries);
  } catch (err) {
    console.error("Error fetching metal receipts:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch metal receipts",
      error: err.message,
    });
  }
};

const getEntryById = async (req, res) => {
  try {
    const entry = await Entry.findById(req.params.id)
      .populate("voucherId")
      .populate("party")
      .populate("enteredBy")
      .populate("stockItems.stock")
      .populate("cash.cashType")
      .populate("cash.currency")
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }
    res.json(entry);
  } catch (err) {
    console.error("Error fetching entry:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch entry",
      error: err.message,
    });
  }
};

const deleteEntryById = async (req, res) => {
  try {

    console.log(req.params.id);

    const entry = await Entry.findById(req.params.id);
    console.log(entry);

    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "Entry not found" });
    }

    console.log("Deleting entry:", entry);


    // Delete related registry entries
    await RegistryService.deleteRegistryByVoucher(entry.voucherCode);

    // Handle reverse operations based on entry type
    const deleteHandlers = {
      "metal-receipt": handleDeleteMetalReceipt,
      "metal-payment": handleDeleteMetalPayment,
      "cash receipt": handleDeleteCashReceipt,
      "cash payment": handleDeleteCashPayment,
    };
    console.log(entry.type);


    if (deleteHandlers[entry.type]) {
      await deleteHandlers[entry.type](entry);
    }

    // Delete related account logs
    // await AccountLog.deleteMany({ reference: entry.voucherCode });

    // Delete the entry itself
    await entry.deleteOne();
    console.log("Entry deleted successfully");

    res.json({ success: true, message: "Entry deleted successfully" });
  } catch (err) {
    console.error("Error deleting entry:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete entry",
      error: err.message,
    });
  }
};

export default {
  editEntry,
  createEntry,
  getCashPayments,
  getCashReceipts,
  getMetalPayments,
  getMetalReceipts,
  getEntryById,
  deleteEntryById
};