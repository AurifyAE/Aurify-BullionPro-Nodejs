import AccountMaster from '../../models/modules/accountMaster.js';
import AccountLog from "../../models/modules/AccountLog.js";

// Create a new account
const createAccount = async (req, res) => {
  try {
    const { name, openingBalance, createdBy } = req.body;

    // Step 1: Create the account
    const account = new AccountMaster({ name, openingBalance });
    await account.save();

    // Step 2: Create the account log for the opening balance
    await AccountLog.create({
      accountId: account._id,
      transactionType: "opening",
      amount: openingBalance,
      balanceAfter: openingBalance,
      note: "Opening balance set at account creation",
      action: "add",
      createdBy: req.admin?.id
    });

    // Step 3: Send response
    res.status(201).json(account);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all accounts
const getAccounts = async (req, res) => {
  try {
    const accounts = await AccountMaster.find({ deleted: false });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAccountById = async (req, res) => {
  try {
    const account = await AccountMaster.findOne({ _id: req.params.id, deleted: false });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAccountLogsById = async (req, res) => {
  try {
    const account = await AccountLog.find({ accountId: req.params.id }).populate("createdBy", "name email");
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update account by ID
const updateAccount = async (req, res) => {
  try {
    const { name, openingBalance } = req.body;

    // Find account
    const existingAccount = await AccountMaster.findById(req.params.id);
    if (!existingAccount) {
      return res.status(404).json({ error: "Account not found" });
    }

    const oldBalance = existingAccount.openingBalance;

    // Update fields
    existingAccount.name = name ?? existingAccount.name;
    existingAccount.openingBalance = openingBalance ?? oldBalance;
    await existingAccount.save();

    // Log if balance changed
    if (openingBalance != null && openingBalance !== oldBalance) {
      await AccountLog.create({
        accountId: existingAccount._id,
        transactionType: "adjustment", // or "update" if you want
        amount: openingBalance,
        balanceAfter: openingBalance,
        note: "Opening balance updated",
        action: "update",
        createdBy: req.admin?.id || process.env.SYSTEM_ADMIN_ID
      });
    }

    res.json(existingAccount);
  } catch (err) {
    console.error("Update account error:", err);
    res.status(400).json({ error: err.message });
  }
};

// Delete account by ID
const deleteAccount = async (req, res) => {
  try {
    const account = await AccountMaster.findByIdAndUpdate(
      req.params.id,
      { deleted: true },
      { new: true }
    );
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json({ message: 'Account soft deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export default {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  getAccountLogsById
};