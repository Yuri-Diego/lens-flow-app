import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { applyClockAt } from "../scripts/e2eClock.js";
import { newLabPrefix, seedLab } from "../scripts/e2eLab.js";
import { AuditEvent, ClientName, Movement } from "../models/index.js";
import { clock } from "../utils/clock.js";
import { addDays, sheetDateOf } from "../utils/dateUtils.js";
import { DEFAULT_PASSWORD, createTestApp, login } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { apiAs } from "./helpers/movements.js";

useTestDb();

const SCRIPT = fileURLToPath(new URL("../scripts/startE2e.js", import.meta.url));

describe("start:e2e", () => {
    it("não roda com NODE_ENV=production", async () => {
        const { code, stderr } = await new Promise((resolve) => {
            execFile(
                process.execPath,
                [SCRIPT],
                {
                    cwd: tmpdir(),
                    env: {
                        PATH: process.env.PATH,
                        SYSTEMROOT: process.env.SYSTEMROOT,
                        NODE_ENV: "production",
                    },
                    timeout: 60_000,
                },
                (error, stdout, output) => resolve({ code: error ? error.code : 0, stderr: output })
            );
        });

        expect(code).toBe(1);
        expect(stderr).toContain("não roda com NODE_ENV=production");
    });

    it("o relógio por requisição não vaza para as outras", async () => {
        const instant = new Date("2026-03-10T02:59:00.000Z");
        const inside = applyClockAt(instant, async () => {
            await new Promise((resolve) => setImmediate(resolve));
            return clock.now();
        });

        expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(5_000);
        expect(await inside).toEqual(instant);
        expect(sheetDateOf(await inside)).toBe("2026-03-09");
    });

    it("o laboratório tem os pendentes de dias anteriores, com histórico e sugestões de cliente", async () => {
        const lab = await seedLab({ prefix: newLabPrefix(), password: DEFAULT_PASSWORD });
        const app = createTestApp();
        const call = apiAs(app, await login(app, lab.users.joao.username));

        const summary = await call("get", "/api/movements/summary");
        expect(summary.body.serverDate).toBe(lab.today);
        expect(summary.body.counts).toEqual({
            launchedToday: 0,
            open: 7,
            pendingFromPreviousDays: 7,
            attention: 2,
            late: 1,
            outNotReleased: 1,
        });
        const boxes = await call("get", "/api/boxes");
        expect(new Set(boxes.body.boxes.map((box) => box.color)).size).toBe(6);

        const movement = await Movement.findById(lab.movements["2"]).lean();
        expect(movement.sheetDate).toBe(addDays(lab.today, -1));
        const events = await AuditEvent.find({ entityId: movement._id }).lean();
        expect(events.map((event) => event.action)).toEqual(["movement.create"]);
        expect(sheetDateOf(events[0].at)).toBe(addDays(lab.today, -1));
        expect(await ClientName.countDocuments({ business: lab.business.id })).toBe(8);
    });
});
