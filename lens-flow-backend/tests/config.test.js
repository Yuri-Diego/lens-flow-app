import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../config/env.js";

const VALID_ENV = {
    DATABASE_URL: "mongodb://127.0.0.1:27017",
    DATABASE_NAME: "lens-flow",
    JWT_SECRET: "um-segredo-de-desenvolvimento",
    CORS_ORIGINS: "http://localhost:5173",
};

function problemsOf(env) {
    try {
        loadConfig(env);
    } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        return error.problems;
    }
    throw new Error("loadConfig deveria ter recusado o ambiente");
}

describe("loadConfig", () => {
    it("lê o ambiente com os padrões", () => {
        expect(loadConfig(VALID_ENV)).toEqual({
            nodeEnv: "development",
            isProduction: false,
            port: 5000,
            databaseUrl: "mongodb://127.0.0.1:27017",
            databaseName: "lens-flow",
            jwtSecret: "um-segredo-de-desenvolvimento",
            corsOrigins: ["http://localhost:5173"],
            trustProxy: false,
        });
    });

    it("não sobe sem banco, sem JWT_SECRET ou sem CORS_ORIGINS, e lista tudo o que falta", () => {
        expect(problemsOf({})).toEqual([
            "DATABASE_URL não definida.",
            "DATABASE_NAME não definida.",
            "JWT_SECRET não definida.",
            "CORS_ORIGINS não definida (exemplo: http://localhost:5173).",
        ]);
        expect(problemsOf({ ...VALID_ENV, JWT_SECRET: "   " })).toEqual(["JWT_SECRET não definida."]);
    });

    it("recusa DATABASE_URL que não é do MongoDB", () => {
        expect(problemsOf({ ...VALID_ENV, DATABASE_URL: "postgres://localhost" })).toEqual([
            "DATABASE_URL precisa começar com mongodb:// ou mongodb+srv://.",
        ]);
    });

    it("exige JWT_SECRET longo em produção", () => {
        expect(problemsOf({ ...VALID_ENV, NODE_ENV: "production" })).toEqual([
            "JWT_SECRET precisa ter pelo menos 32 caracteres em produção.",
        ]);
        const config = loadConfig({ ...VALID_ENV, NODE_ENV: "production", JWT_SECRET: "x".repeat(32) });
        expect(config.isProduction).toBe(true);
    });

    it("lê várias origens de CORS e recusa origem com caminho ou inválida", () => {
        const config = loadConfig({
            ...VALID_ENV,
            CORS_ORIGINS: "http://localhost:5173, https://lab.exemplo.com.br:8443/",
        });
        expect(config.corsOrigins).toEqual(["http://localhost:5173", "https://lab.exemplo.com.br:8443"]);

        expect(problemsOf({ ...VALID_ENV, CORS_ORIGINS: "https://lab.exemplo.com.br/app" })).toHaveLength(1);
        expect(problemsOf({ ...VALID_ENV, CORS_ORIGINS: "localhost" })).toHaveLength(1);
        expect(problemsOf({ ...VALID_ENV, CORS_ORIGINS: "ftp://lab.exemplo.com.br" })).toHaveLength(1);
    });

    it("valida PORT", () => {
        expect(loadConfig({ ...VALID_ENV, PORT: "8080" }).port).toBe(8080);
        expect(problemsOf({ ...VALID_ENV, PORT: "abc" })).toEqual(["PORT inválida: abc"]);
        expect(problemsOf({ ...VALID_ENV, PORT: "0" })).toEqual(["PORT inválida: 0"]);
    });

    it("traduz TRUST_PROXY para o Express", () => {
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: "" }).trustProxy).toBe(false);
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: "false" }).trustProxy).toBe(false);
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: "1" }).trustProxy).toBe(1);
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: "true" }).trustProxy).toBe(true);
        expect(loadConfig({ ...VALID_ENV, TRUST_PROXY: "loopback" }).trustProxy).toBe("loopback");
    });
});
