import FundTransferService from "../../services/modules/FundTransferService.js";
// Named export
export const accountToAccountTransfer = async (req, res, next) => {
  try {
    const { senderId, receiverId, value, assetType, voucher } = req.body;
    const adminId = req.admin.id;

    if (!senderId || !receiverId || value === undefined || value === null || !assetType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Allow negative values, just check that value is a valid number
    if (typeof value !== 'number' || isNaN(value)) {
      return res.status(400).json({ message: "Value must be a valid number" });
    }

    if (value === 0) {
      return res.status(400).json({ message: "Transfer value cannot be zero" });
    }

    await FundTransferService.accountToAccountTransfer(
      senderId,
      receiverId,
      value,
      assetType,
      adminId,
      voucher
    );

    const transferType = value < 0 ? "Reverse transfer" : "Transfer";
    res.status(200).json({
      message: `${transferType} successful`,
      transferAmount: Math.abs(value),
      direction: value < 0 ? "reversed" : "normal"
    });
  } catch (error) {
    next(error);
  }
};

export const openingBalanceTransfer = async (req, res, next) => {

  try {
    const { receiverId, value, assetType, voucher } = req.body;
    const adminId = req.admin.id;

    if (!receiverId || !value || !assetType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await FundTransferService.openingBalanceTransfer(receiverId, value, adminId, assetType, voucher);

    res.status(200).json({ message: "Opening balance transfer successful" });
  } catch (error) {
    if (error.code === "OPENING_EXISTS") {
      return res.status(200).json({
        success: false,
        message: error.message,
        alreadyExists: true,
      });
    }
    next(error);
  }
};

// get all fund transfers with full population
export const getFundTransfers = async (req, res, next) => {
  try {
    const fundTransfers = await FundTransferService.getFundTransfers();
    res.status(200).json(fundTransfers);
  } catch (error) {
    next(error);
  }
};



