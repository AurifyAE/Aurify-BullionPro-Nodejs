import AccountFixingService from "../../services/modules/AccountFixingService.js";

export const createAccountFixing = async (req, res, next) => {
    try {
        const adminId = req.admin.id;
        const result = await OpeningFixingService.createOpeningFixing(
            req.body,
            adminId
        );

        res.status(201).json({
            success: true,
            message: "Opening fixing position created",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};


export const getAllAccountFixings = async (req, res, next) => {
    try {
        const data = await AccountFixingService.fetchAllAccountFixings();

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
};

export const getAccountFixingById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const fixing = await AccountFixingService.fetchAccountFixingById(id);
        if (!fixing) {
            return res.status(404).json({
                success: false,
                message: "Account fixing not found",
            });
        }

        res.status(200).json({
            success: true,
            data: fixing,
        });
    } catch (error) {
        next(error);
    }
};