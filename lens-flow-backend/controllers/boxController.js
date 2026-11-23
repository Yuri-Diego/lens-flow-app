import * as boxService from "../services/boxService.js";

export async function list(req, res) {
    res.json({ boxes: await boxService.listBoxes(req.auth, req.validated.query) });
}

export async function getById(req, res) {
    res.json({ box: await boxService.getBox(req.auth, req.validated.params.id) });
}

export async function create(req, res) {
    const box = await boxService.createBox(req.auth, req.validated.body);
    res.status(201).json({ box });
}

export async function createBatch(req, res) {
    res.json(await boxService.createBoxesBatch(req.auth, req.validated.body));
}

export async function update(req, res) {
    const box = await boxService.updateBox(req.auth, req.validated.params.id, req.validated.body);
    res.json({ box });
}
