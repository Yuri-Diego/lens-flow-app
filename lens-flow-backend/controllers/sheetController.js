import { listMovements } from "../services/movementQueryService.js";
import * as sheetService from "../services/sheetService.js";

export async function list(req, res) {
    res.json(await sheetService.listSheets(req.auth, req.validated.query));
}

/** Um dia: os contadores e os serviços daquela folha, com cursor. */
export async function getByDate(req, res) {
    const { date } = req.validated.params;
    const [counts, page] = await Promise.all([
        sheetService.sheetCounts(req.auth, date),
        listMovements(req.auth, { ...req.validated.query, from: date, to: date }),
    ]);
    res.json({ sheet: { date, counts }, ...page });
}
