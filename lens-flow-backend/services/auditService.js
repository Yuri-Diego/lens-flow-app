import AuditEvent from "../models/AuditEvent.js";
import { clock } from "../utils/clock.js";

function toEvent({ businessId, actorId = null, action, entity, entityId, before = null, after = null }) {
    return {
        business: businessId,
        user: actorId,
        action,
        entity,
        entityId,
        before,
        after,
        at: clock.now(),
    };
}

/**
 * Grava um evento no histórico (RN-02): quem (actorId, ou null para o
 * sistema), o quê (action), em quê (entity, entityId), o antes e o depois.
 * Passe a `session` da transação para gravar junto com a mudança.
 *
 * Nunca ponha senha ou hash em `before`/`after`.
 */
export async function audit(event, { session } = {}) {
    const [saved] = await AuditEvent.create([toEvent(event)], { session });
    return saved;
}

/** Vários eventos numa só escrita (cadastro em lote). */
export async function auditMany(events, { session } = {}) {
    if (events.length === 0) {
        return [];
    }
    return AuditEvent.insertMany(events.map(toEvent), { session });
}
