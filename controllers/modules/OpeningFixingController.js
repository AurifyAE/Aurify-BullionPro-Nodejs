import OpeningFixingService from "../../services/modules/OpeningFixingService.js";

export const createOpeningFixing = async (req, res, next) => {
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


export const getAllOpeningFixings = async (req, res, next) => {
    try {
        const data = await OpeningFixingService.fetchAllOpeningFixings();

        res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
};