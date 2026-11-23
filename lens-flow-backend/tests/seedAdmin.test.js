import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { AuditEvent, Business, User } from "../models/index.js";
import { SeedRefusedError, seedFirstAdmin } from "../services/seedService.js";
import { createBusiness, createTestApp, createUser, findSecrets } from "./helpers/app.js";
import { testDbUri, useTestDb } from "./helpers/db.js";

useTestDb();

const SCRIPT = fileURLToPath(new URL("../scripts/seedAdmin.js", import.meta.url));
const SEED_PASSWORD = "primeira-senha-do-admin";
const SEED_INPUT = {
    businessName: "Laboratório Lente Boa",
    name: "Yuri",
    username: "yuri",
    password: SEED_PASSWORD,
};

/**
 * Roda o script como o npm run seed:admin faria. O cwd é uma pasta temporária
 * para o .env local do desenvolvedor não entrar no teste.
 */
function runSeed(env, args = []) {
    const childEnv = Object.fromEntries(
        Object.entries({
            PATH: process.env.PATH,
            SYSTEMROOT: process.env.SYSTEMROOT,
            BCRYPT_ROUNDS: "4",
            DATABASE_URL: testDbUri(),
            DATABASE_NAME: "lens-flow-seed-cli",
            ...env,
        }).filter(([, value]) => value !== undefined)
    );
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [SCRIPT, ...args],
            { cwd: tmpdir(), env: childEnv, timeout: 60_000 },
            (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })
        );
    });
}

describe("seedFirstAdmin", () => {
    it("cria a empresa e o primeiro admin, que consegue entrar, e registra no histórico", async () => {
        const result = await seedFirstAdmin(SEED_INPUT);

        expect(result).toMatchObject({
            businessCreated: true,
            business: { name: "Laboratório Lente Boa" },
            user: { name: "Yuri", username: "yuri" },
        });
        const admin = await User.findOne({ username: "yuri" }).lean();
        expect(admin).toMatchObject({ role: "admin", active: true });
        expect(String(admin.business)).toBe(result.business.id);

        const login = await request(createTestApp())
            .post("/api/auth/login")
            .send({ username: "yuri", password: SEED_PASSWORD });
        expect(login.status).toBe(200);
        expect(login.body.user.role).toBe("admin");

        const events = await AuditEvent.find().sort({ at: 1 }).lean();
        expect(events.map((event) => [event.action, event.user])).toEqual([
            ["business.create", null],
            ["user.create", null],
        ]);
        expect(findSecrets(events, [SEED_PASSWORD])).toEqual([]);
    });

    it("recusa quando já existe admin ativo, sem alterar nada", async () => {
        await seedFirstAdmin(SEED_INPUT);

        await expect(seedFirstAdmin({ ...SEED_INPUT, username: "outro" })).rejects.toThrow(SeedRefusedError);
        expect(await User.countDocuments()).toBe(1);
        expect(await Business.countDocuments()).toBe(1);
        expect(await AuditEvent.countDocuments()).toBe(2);
    });

    it("reaproveita a empresa já criada quando ela ainda não tem admin", async () => {
        const existing = await createBusiness("Laboratório Lente Boa");

        const result = await seedFirstAdmin(SEED_INPUT);

        expect(result.businessCreated).toBe(false);
        expect(result.business.id).toBe(String(existing._id));
        expect(await Business.countDocuments()).toBe(1);
    });

    it("recusa usuário que já existe", async () => {
        const business = await createBusiness("Laboratório Lente Boa");
        await createUser({ business, username: "yuri", role: "operator" });

        await expect(seedFirstAdmin(SEED_INPUT)).rejects.toThrow(/já existe/);
        expect(await User.countDocuments({ role: "admin" })).toBe(0);
    });
});

describe("npm run seed:admin (scripts/seedAdmin.js)", () => {
    it("cria o admin na primeira vez e recusa na segunda, sem mostrar a senha", async () => {
        const first = await runSeed({ SEED_ADMIN_PASSWORD: SEED_PASSWORD });

        expect(first.code).toBe(0);
        expect(first.stdout).toContain("Empresa criada: Laboratório");
        expect(first.stdout).toContain("Admin criado: admin (Administrador)");
        expect(first.stdout + first.stderr).not.toContain(SEED_PASSWORD);

        const second = await runSeed({ SEED_ADMIN_PASSWORD: SEED_PASSWORD });
        expect(second.code).toBe(1);
        expect(second.stderr).toContain("Já existe um administrador ativo (admin). Nada foi alterado.");
    });

    it("usa os nomes opcionais das variáveis de ambiente", async () => {
        const result = await runSeed({
            DATABASE_NAME: "lens-flow-seed-cli-nomes",
            SEED_ADMIN_PASSWORD: SEED_PASSWORD,
            SEED_ADMIN_USERNAME: "Yuri",
            SEED_ADMIN_NAME: "Yuri Almeida",
            SEED_BUSINESS_NAME: "Lente Boa",
        });

        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Empresa criada: Lente Boa");
        expect(result.stdout).toContain("Admin criado: yuri (Yuri Almeida)");
    });

    it.each([
        [{}, [], "Defina SEED_ADMIN_PASSWORD"],
        [{ SEED_ADMIN_PASSWORD: "curta" }, [], "SEED_ADMIN_PASSWORD: A senha precisa ter pelo menos 8 caracteres."],
        [{ SEED_ADMIN_PASSWORD: SEED_PASSWORD, SEED_ADMIN_USERNAME: "joão" }, [], "SEED_ADMIN_USERNAME:"],
        [{ SEED_ADMIN_PASSWORD: SEED_PASSWORD }, [SEED_PASSWORD], "não aceita argumentos"],
        [{ SEED_ADMIN_PASSWORD: SEED_PASSWORD, DATABASE_URL: "" }, [], "Defina DATABASE_URL e DATABASE_NAME"],
    ])("recusa entrada inválida (%o %o)", async (env, args, message) => {
        const result = await runSeed({ DATABASE_NAME: "lens-flow-seed-cli-erros", ...env }, args);

        expect(result.code).toBe(1);
        expect(result.stderr).toContain(message);
        expect(result.stdout).toBe("");
    });
});
