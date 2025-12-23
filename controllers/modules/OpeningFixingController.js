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
