const Entry = require("../../models/modules/EntryModel");
const Registry = require("../../models/modules/Registry.js");
const AccountType = require("../../models/modules/AccountType.js");
const AccountMaster = require("../../models/modules/accountMaster.js");
const { default: AccountLog } = require("../../models/modules/AccountLog.js");

exports.createEntry = async (data) => {
  try {
    // Prepare entry data based on type
    let entryData = {
      voucherId: data.voucherId,
      type: data.type,
      voucherCode: data.voucherCode,
      voucherDate: data.voucherDate,
      party: data.party,
      enteredBy: data.enteredBy,
      remarks: data.remarks,
    };

    // Add type-specific fields
    if (data.type === "metal-receipt" || data.type === "metal-payment") {
      entryData.stocks = data.stocks;
    } else if (data.type === "cash receipt" || data.type === "cash payment") {
      entryData.cash = data.cash;
    }

    const entry = new Entry(entryData);
    

    // Handle metal-receipt
    if (data.type === "metal-receipt") {
      await handleMetalReceipt(entry ,entry.voucherNumber );
    }

    // Handle cash receipt
    if (data.type === "cash receipt") {
      await handleCashReceipt(entry);
    }

    // Handle cash payment
    if (data.type === "cash payment") {
      await handleCashPayment(entry);
    }

    // Handle metal-payment
    if (data.type === "metal-payment") {
      await handleMetalPayment(entry);
    }

    // Save entry only after all handlers succeed
    await entry.save();

    return {
      success: true,
      data: entry,
      message: `${data.type} entry created successfully`,
    };
  } catch (error) {
    console.error("Error creating entry:", error);
    throw new Error("Failed to create entry");
  }
};

// Helper function for metal-receipt
const handleMetalReceipt = async (entry , reference) => {
  for (const stock of entry.stocks) {
    const transactionId = await Registry.generateTransactionId();

    const description =
      stock.remarks && stock.remarks.trim() !== ""
        ? stock.remarks
        : "No description";
    // Registry entry for "stock balance"
    await Registry.create({
      transactionId,
      EntryTransactionId:entry._id,
      type: "STOCK_BALANCE",
      description,
      value: stock.purityWeight,
      runningBalance: 0,
      previousBalance: 0,
      credit: stock.purityWeight,
      reference: reference,
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created stock balance entry for stock: ${stock.stock}`);

    // Registry entry for "gold"
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId:entry._id,
      type: "GOLD",
      description: stock.remarks || "",
      value: stock.purityWeight,
      runningBalance: 0,
      previousBalance: 0,
      debit: stock.purityWeight,
      reference: reference,
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created gold entry for stock: ${reference}`);
  }
};

// Helper function for cash receipt
const handleCashReceipt = async (entry) => {
  // Find AccountType
  const accountType = await AccountType.findOne({ _id: entry.party });
  console.log("Fetched accountType:", accountType);
  if (!accountType) {
    throw new Error("Account not found");
  }

  for (const cashItem of entry.cash) {
   
    const transactionId = await Registry.generateTransactionId();

    // Find and validate cash type account
    const cashType = await AccountMaster.findOne({ _id: cashItem.cashType });
    console.log("Fetched cashType:", cashType);
    if (!cashType) {
      // throw new Error(`Cash type account not found for ID: ${cashItem.cashType}`);
    }

    // Check if balances field exists
    console.log("accountType.balances:", accountType.balances);
    if (!accountType.balances || !accountType.balances.cashBalance) {
      throw new Error("Cash balance not found for this account");
    }

    // Find the currency in cashBalance array
    const currencyBalance = accountType.balances.cashBalance.find(
      (balance) => balance.currency.toString() === cashItem.currency.toString()
    );
    console.log("currencyBalance:", currencyBalance);

    if (!currencyBalance) {
      throw new Error(`User doesn't have the selected currency`);
    }

    const requestedAmount = cashItem.amount || 0;

    // Deduct amount from account cash balance
    currencyBalance.amount += requestedAmount;
    currencyBalance.lastUpdated = new Date();

  
    // Add amount to cash type opening balance
    cashType.openingBalance = (cashType.openingBalance || 0) + requestedAmount;
    await cashType.save();
    await AccountLog.create([{
      accountId: cashType._id,
      transactionType: "deposit", // cash receipt adds to cashType
      amount: requestedAmount,
      balanceAfter: cashType.openingBalance,
      note: cashItem.remarks || entry.remarks || "Cash receipt",
      action: "add",
      createdBy: createdById,
    }], { session });

    // Registry entry for "cash balance"
    await Registry.create({
      transactionId,
      EntryTransactionId:entry._id,
      type: "PARTY_CASH_BALANCE",
      description: cashItem.remarks || entry.remarks || "",
      value: requestedAmount,
      runningBalance: 0,
      previousBalance: 0,
      credit: requestedAmount,
      reference: entry._id.toString(),
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created cash balance entry for cashType: ${cashType._id}`);

    // Registry entry for "cash"
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId:entry._id,
      type: "CASH",
      description: cashItem.remarks || entry.remarks || "",
      value: requestedAmount,
      runningBalance: 0,
      previousBalance: 0,
      debit: requestedAmount,
      reference: entry._id.toString(),
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created cash entry for cashType: ${cashType._id}`);
  }

  // Save account after all updates
  await accountType.save();
};

// Helper function for cash payment
const handleCashPayment = async (entry) => {
  console.log("Processing cash payment:", entry);

  // Rename variable to avoid shadowing
  const accountType = await AccountType.findOne({ _id: entry.party });
  if (!accountType) {
    throw new Error("Account not found");
  }

  console.log(`AccountType found: ${accountType._id}`);

  // Process each cash item
  for (const cashItem of entry.cash) {
    const transactionId = await Registry.generateTransactionId();

    // Find and validate cash type account
    console.log(cashItem.cashType, "this is cash type");
    const cashType = await AccountMaster.findOne({ _id: cashItem.cashType });
    if (!cashType) {
      throw new Error(
        `Cash type account not found for ID: ${cashItem.cashType}`
      );
    }

    console.log(`CashType found: ${cashType.name || cashType._id}`);

    const requestedAmount = cashItem.amount || 0;

    // Allow negative balances - no balance check needed

    // Check if balances field exists, if not create it
    if (!accountType.balances) {
      accountType.balances = { cashBalance: [] };
    }
    if (!accountType.balances.cashBalance) {
      accountType.balances.cashBalance = [];
    }

    // Find the currency in cashBalance array
    let currencyBalance = accountType.balances.cashBalance.find(
      (balance) => balance.currency.toString() === cashItem.currency.toString()
    );

    // If currency doesn't exist, create it
    if (!currencyBalance) {
      currencyBalance = {
        currency: cashItem.currency,
        amount: 0,
        lastUpdated: new Date(),
      };
      accountType.balances.cashBalance.push(currencyBalance);
    }

    const absRequestedAmount = Math.abs(requestedAmount);
    // Always subtract for deductions
    currencyBalance.amount -= absRequestedAmount;
    currencyBalance.lastUpdated = new Date();
    cashType.openingBalance = (cashType.openingBalance || 0) - absRequestedAmount;
    await cashType.save();

    // Registry entry for "cash balance" (debit for payment)
    await Registry.create({
      transactionId,
      EntryTransactionId:entry._id,
      type: "PARTY_CASH_BALANCE",
      description: cashItem.remarks || entry.remarks || "",
      value: requestedAmount,
      runningBalance: 0,
      previousBalance: 0,
      debit: requestedAmount,
      reference: entry._id.toString(),
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created cash balance entry for cashType: ${cashType._id}`);

    // Registry entry for "cash" (credit for payment)
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId:entry._id,
      type: "CASH",
      description: cashItem.remarks || entry.remarks || "",
      value: requestedAmount,
      runningBalance: 0,
      previousBalance: 0,
      credit: requestedAmount,
      reference: entry._id.toString(),
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created cash entry for cashType: ${cashType._id}`);
  }

  // Save account after all updates
  await accountType.save();
};

// Helper function for metal-payment
const handleMetalPayment = async (entry) => {
  for (const stock of entry.stocks) {
    const transactionId = await Registry.generateTransactionId();

    // Registry entry for "stock balance" (debit for payment)
    await Registry.create({
      transactionId,
      EntryTransactionId:entry._id,
      type: "STOCK_BALANCE",
      description: stock.remarks || "",
      value: stock.purityWeight,
      runningBalance: 0,
      previousBalance: 0,
      debit: stock.purityWeight,
      reference: stock.stock ? stock.stock.toString() : "",
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created stock balance entry for stock: ${stock.stock}`);

    // Registry entry for "gold" (credit for payment)
    await Registry.create({
      transactionId: await Registry.generateTransactionId(),
      EntryTransactionId:entry._id,
      type: "GOLD",
      description: stock.remarks || "",
      value: stock.purityWeight,
      runningBalance: 0,
      previousBalance: 0,
      credit: stock.purityWeight,
      reference: stock.stock ? stock.stock.toString() : "",
      createdBy: entry.enteredBy,
      party: entry.party ? entry.party.toString() : null,
    });
    console.log(`Created gold entry for stock: ${stock.stock}`);
  }
};
