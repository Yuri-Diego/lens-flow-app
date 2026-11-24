import { AUDIT_ENTITIES } from "../models/AuditEvent.js";
import { cursor, objectId, orderedRange, pageLimit, sheetDate } from "./common.js";
import { z } from "./zod.js";

export const listAuditQuery = z
    .strictObject({
        user: objectId.optional(),
        entity: z
            .enum(AUDIT_ENTITIES, {
                error: `Entidade inválida. Use uma destas: ${AUDIT_ENTITIES.join(", ")}.`,
            })
            .optional(),
        entityId: objectId.optional(),
        from: sheetDate.optional(),
        to: sheetDate.optional(),
        cursor: cursor.optional(),
        limit: pageLimit.optional(),
    })
    .refine(...orderedRange("from", "to"));
