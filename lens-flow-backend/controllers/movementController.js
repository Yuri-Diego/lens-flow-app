import * as batchService from "../services/movementBatchService.js";
import * as queryService from "../services/movementQueryService.js";
import * as movementService from "../services/movementService.js";

export async function list(req, res) {
    res.json(await queryService.listMovements(req.auth, req.validated.query));
}

export async function summary(req, res) {
    res.json(await queryService.getMovementSummary(req.auth));
}

export async function getById(req, res) {
    res.json(await queryService.getMovementDetail(req.auth, req.validated.params.id));
}

export async function create(req, res) {
    res.status(201).json(await movementService.launchMovement(req.auth, req.validated.body));
}

export async function update(req, res) {
    res.json(
        await movementService.updateMovement(req.auth, req.validated.params.id, req.validated.body)
    );
}

export async function remove(req, res) {
    await movementService.deleteMovement(req.auth, req.validated.params.id);
    res.status(204).end();
}

export async function changeBox(req, res) {
    res.json(
        await movementService.changeMovementBox(req.auth, req.validated.params.id, req.validated.body)
    );
}

export async function checkout(req, res) {
    res.json(await movementService.checkoutMovement(req.auth, req.validated.params.id));
}

export async function releaseBox(req, res) {
    res.json(await movementService.releaseMovementBox(req.auth, req.validated.params.id));
}

export async function undo(req, res) {
    res.json(
        await movementService.undoMovementAction(req.auth, req.validated.params.id, req.validated.body)
    );
}

export async function batch(req, res) {
    res.json(await batchService.runBatch(req.auth, req.validated.body));
}

export async function undoBatch(req, res) {
    res.json(await batchService.undoBatch(req.auth, req.validated.params.batchId));
}
