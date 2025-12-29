
import openingBalanceService from "../../services/modules/OpeningBalanceService.js";
export const createPartyOpeningBalance = async (req, res, next) => {
    try {
        const {
            voucherCode,
            voucherType,
            voucherDate,
            description,
            entries,
        } = req.body;

        const adminId = req.admin.id;

        if (!voucherCode || !voucherDate || !Array.isArray(entries) || !entries.length) {
            return res.status(400).json({
                message: "voucherCode, voucherDate and entries[] are required",
            });
        }

        await openingBalanceService.createOpeningBalanceBatch({
            voucherCode,
            voucherType,
            voucherDate,
            description,
            entries,
            adminId,
        });

        res.status(201).json({
            success: true,
            message: "Opening balance batch created successfully",
        });
    } catch (error) {
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
        const { VoucherID } = req.params;
        const { voucherType, voucherDate, description, entries } = req.body;

        console.log(req.body, req.params);

        const adminId = req.admin.id;

        const updated = await openingBalanceService.updateOpeningBalanceVoucher({
            voucherCode: VoucherID,
            voucherType,
            voucherDate,
            description,
            entries,
            adminId,
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


