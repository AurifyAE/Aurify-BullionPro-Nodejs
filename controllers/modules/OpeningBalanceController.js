
import openingBalanceService from "../../services/modules/OpeningBalanceService.js";
export const createPartyOpeningBalance = async (req, res, next) => {
    try {
        const {
            partyId,
            value,
            assetType,
            assetCode,
            voucher,
            voucherDate,
            description,
        } = req.body;

        const adminId = req.admin.id;

        if (!partyId || value === undefined || !assetType || !assetCode) {
            return res.status(400).json({
                message: "partyId, value, assetType, assetCode are required",
            });
        }

        await openingBalanceService.createPartyOpeningBalance({
            partyId,
            value,
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
