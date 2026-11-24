import { listAuditEvents } from "../services/auditQueryService.js";

export async function list(req, res) {
    res.json(await listAuditEvents(req.auth, req.validated.query));
}
