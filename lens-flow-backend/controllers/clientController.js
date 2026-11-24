import * as clientService from "../services/clientService.js";

export async function suggestions(req, res) {
    res.json({ items: await clientService.suggestClientNames(req.auth, req.validated.query) });
}
