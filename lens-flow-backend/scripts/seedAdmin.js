/**
 * npm run seed:admin: cria a empresa e o primeiro admin (D2).
 *
 * A senha vem só de SEED_ADMIN_PASSWORD, nunca de argumento (que ficaria no
 * histórico do terminal). Opcionais: SEED_ADMIN_USERNAME (padrão "admin"),
 * SEED_ADMIN_NAME ("Administrador") e SEED_BUSINESS_NAME ("Laboratório").
 * Recusa, sem alterar nada, se já existir um admin ativo.
 *
 * Usa DATABASE_URL e DATABASE_NAME (do ambiente ou do .env). Não precisa de
 * replica set.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, ensureIndexes } from "../db/database.js";
import "../models/index.js";
import { SeedRefusedError, seedFirstAdmin } from "../services/seedService.js";
import { password, personName, username } from "../validation/userSchemas.js";
import { z } from "../validation/zod.js";

const ENV_BY_FIELD = {
    password: "SEED_ADMIN_PASSWORD",
    username: "SEED_ADMIN_USERNAME",
    name: "SEED_ADMIN_NAME",
    businessName: "SEED_BUSINESS_NAME",
};

const seedInput = z.strictObject({
    password,
    username,
    name: personName,
    businessName: z
        .string()
        .trim()
        .min(1, { error: "Informe o nome da empresa." })
        .max(100, { error: "Use no máximo 100 caracteres no nome da empresa." }),
});

class SeedInputError extends Error {}

function readInput(env) {
    if (process.argv.length > 2) {
        throw new SeedInputError(
            "Este script não aceita argumentos. Passe a senha em SEED_ADMIN_PASSWORD."
        );
    }
    const databaseUrl = env.DATABASE_URL?.trim();
    const databaseName = env.DATABASE_NAME?.trim();
    if (!databaseUrl || !databaseName) {
        throw new SeedInputError("Defina DATABASE_URL e DATABASE_NAME (veja o .env.example).");
    }
    if (!env.SEED_ADMIN_PASSWORD) {
        throw new SeedInputError("Defina SEED_ADMIN_PASSWORD com a senha do primeiro admin.");
    }

    const parsed = seedInput.safeParse({
        password: env.SEED_ADMIN_PASSWORD,
        username: env.SEED_ADMIN_USERNAME || "admin",
        name: env.SEED_ADMIN_NAME || "Administrador",
        businessName: env.SEED_BUSINESS_NAME || "Laboratório",
    });
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (issue) => `${ENV_BY_FIELD[issue.path[0]] ?? issue.path.join(".")}: ${issue.message}`
        );
        throw new SeedInputError(lines.join("\n"));
    }
    return { databaseUrl, databaseName, input: parsed.data };
}

async function main() {
    const { databaseUrl, databaseName, input } = readInput(process.env);
    await connectDB({ databaseUrl, databaseName });
    try {
        await ensureIndexes();
        const result = await seedFirstAdmin(input);
        console.log(
            result.businessCreated
                ? `Empresa criada: ${result.business.name}`
                : `Empresa já existente: ${result.business.name}`
        );
        console.log(`Admin criado: ${result.user.username} (${result.user.name})`);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    const known = error instanceof SeedInputError || error instanceof SeedRefusedError;
    console.error(known ? error.message : `Falha no seed: ${error.message}`);
    process.exitCode = 1;
});
