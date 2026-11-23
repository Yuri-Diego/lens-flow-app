import { cursor, orderedRange, pageLimit, sheetDate } from "./common.js";
import { z } from "./zod.js";

export const listSheetsQuery = z
    .strictObject({
        from: sheetDate.optional(),
        to: sheetDate.optional(),
        cursor: cursor.optional(),
        limit: pageLimit.optional(),
    })
    .refine(...orderedRange("from", "to"));

export const sheetDateParams = z.strictObject({ date: sheetDate });
