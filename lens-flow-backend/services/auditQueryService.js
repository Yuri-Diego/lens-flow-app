import AuditEvent from "../models/AuditEvent.js";
import User from "../models/User.js";
import { instantRange } from "../utils/dateUtils.js";
import { userRef } from "./movementPresenter.js";
import { DEFAULT_PAGE_SIZE, findPage, pageQuery, sortField } from "./pagination.js";

const AUDIT_SORT = Object.freeze([sortField("at", -1, "date"), sortField("_id", -1, "objectId")]);

function auditListOptions(auth, params) {
    const filter = { business: auth.businessId };
    if (params.user) {
        filter.user = params.user;
    }
    if (params.entity) {
        filter.entity = params.entity;
    }
    if (params.entityId) {
        filter.entityId = params.entityId;
    }
    if (params.from || params.to) {
        filter.at = instantRange(params.from, params.to);
    }
    return {
        filter,
        spec: AUDIT_SORT,
        sortName: "audit",
        cursor: params.cursor,
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
        buildQuery: (pageFilter) => AuditEvent.find(pageFilter),
    };
}

/** A consulta da página, sem executar (para o explain dos testes). */
export function auditListQuery(auth, params) {
    return pageQuery(auditListOptions(auth, params));
}

/**
 * GET /audit (admin): o histórico geral da empresa, do mais recente, com
 * filtros por usuário, entidade, registro e período (datas no fuso da
 * empresa). Os nomes dos usuários vêm numa consulta só.
 */
export async function listAuditEvents(auth, params) {
    const { docs, nextCursor } = await findPage(auditListOptions(auth, params));
    const userIds = [...new Set(docs.map((event) => event.user).filter(Boolean).map(String))];
    const users =
        userIds.length === 0
            ? []
            : await User.find({ _id: { $in: userIds }, business: auth.businessId })
                  .select("name")
                  .lean();
    const names = new Map(users.map((user) => [String(user._id), user.name]));
    return {
        items: docs.map((event) => ({
            id: String(event._id),
            action: event.action,
            entity: event.entity,
            entityId: String(event.entityId),
            user: userRef(event.user, names),
            before: event.before ?? null,
            after: event.after ?? null,
            at: event.at,
        })),
        nextCursor,
    };
}
