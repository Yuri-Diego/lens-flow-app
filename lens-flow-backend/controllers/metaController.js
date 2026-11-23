import { boxColorsMeta } from "../domain/boxColors.js";

export function boxColors(req, res) {
    res.json(boxColorsMeta());
}
