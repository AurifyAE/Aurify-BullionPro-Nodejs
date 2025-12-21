
import openingBalanceService from "../../services/modules/OpeningBalanceService.js";
export const createPartyOpeningBalance = async (req, res, next) => {
    try {
        const {
            partyId,
            value,
            transactionType,
            assetType,
            assetCode,
            voucher,
            voucherDate,
            description,
        } = req.body;

        const adminId = req.admin.id;

        if (!["credit", "debit"].includes(transactionType)) {
            return res.status(400).json({ message: "Invalid transaction type" });
        }

        if (!partyId || value === undefined || !assetType || !assetCode) {
            return res.status(400).json({
                message: "partyId, value, assetType, assetCode are required",
            });
        }

        await openingBalanceService.createPartyOpeningBalance({
            partyId,
            value,
            transactionType,
            adminId,
            assetType,
            assetCode,
            voucher,
            voucherDate,
            description,
        });

        res.status(201).json({
            success: true,
            message: "Party opening balance created successfully",
        });
    } catch (error) {
        if (error.code === "OPENING_EXISTS") {
            return res.status(409).json({
                success: false,
                message: error.message,
                alreadyExists: true,
            });
        }
        next(error);
    }
};

export const getAllPartyOpeningBalances = async (req, res, next) => {
    try {
        const openings = await openingBalanceService.getAllPartyOpeningBalances();

        res.status(200).json({
            success: true,
            data: openings,
        });
    } catch (error) {
        next(error);
    }
};


export const updateOpeningBalance = async (req, res, next) => {
    try {
        const { voucherId } = req.params;

        const {
            value,
            transactionType,
            assetType,
            assetCode,
            voucherDate,
            description,
        } = req.body;

        const updated =
            await openingBalanceService.updatePartyOpeningBalance({
                voucherId,
                value,
                transactionType,
                assetType,
                assetCode,
                voucherDate,
                description,
            });

        res.status(200).json({
            success: true,
            data: updated,
            message: "Opening balance updated successfully",
        });
    } catch (error) {
        next(error);
    }
};


