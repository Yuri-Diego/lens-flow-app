import "./env.js";
import request from "supertest";
import { createApp } from "../../app.js";
import { Business, User } from "../../models/index.js";
import { hashPassword } from "../../services/passwordService.js";
import { SESSION_COOKIE } from "../../services/sessionService.js";

export const TEST_ORIGIN = "http://localhost:5173";
export const DEFAULT_PASSWORD = "senha-forte-123";

export const TEST_CONFIG = Object.freeze({
    nodeEnv: "test",
    isProduction: false,
    port: 0,
    databaseUrl: "mongodb://127.0.0.1:27017",
    databaseName: "lens-flow-test",
    jwtSecret: "segredo-so-para-testes-com-mais-de-32-caracteres",
    corsOrigins: Object.freeze([TEST_ORIGIN]),
    trustProxy: false,
});

/** App novo a cada chamada: os limites de tentativas começam zerados. */
export function createTestApp(overrides = {}) {
    return createApp({ ...TEST_CONFIG, ...overrides });
}

export function createBusiness(name = "Laboratório Teste") {
    return Business.create({ name });
}

let sequence = 0;

export async function createUser({
    business,
    role = "operator",
    username,
    name,
    password = DEFAULT_PASSWORD,
    active = true,
} = {}) {
    sequence += 1;
    return User.create({
        business: business._id ?? business,
        name: name ?? `Pessoa ${sequence}`,
        username: username ?? `pessoa${sequence}`,
        passwordHash: await hashPassword(password),
        role,
        active,
    });
}

/** "lf_session=…" do Set-Cookie, pronto para mandar no cabeçalho Cookie. */
export function sessionCookieFrom(response) {
    const header = response.headers["set-cookie"] ?? [];
    const cookie = header.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    return cookie?.split(";")[0];
}

export async function login(app, username, password = DEFAULT_PASSWORD) {
    const response = await request(app).post("/api/auth/login").send({ username, password });
    if (response.status !== 200) {
        throw new Error(
            `Login de ${username} falhou: ${response.status} ${JSON.stringify(response.body)}`
        );
    }
    return sessionCookieFrom(response);
}

/** Empresa com um admin e um operador, os dois já logados. */
export async function setupBusiness(app, label) {
    const business = await createBusiness(`Laboratório ${label.toUpperCase()}`);
    const admin = await createUser({
        business,
        role: "admin",
        username: `admin-${label}`,
        name: `Admin ${label.toUpperCase()}`,
    });
    const operator = await createUser({
        business,
        role: "operator",
        username: `operador-${label}`,
        name: `Operador ${label.toUpperCase()}`,
    });
    return {
        business,
        admin,
        operator,
        adminCookie: await login(app, admin.username),
        operatorCookie: await login(app, operator.username),
    };
}

const SECRET_KEYS = new Set(["password", "passwordHash", "currentPassword", "newPassword"]);
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

/**
 * Caminhos onde aparece senha ou hash: chave com nome de senha, valor com
 * cara de hash bcrypt ou alguma das senhas em texto puro dadas.
 */
export function findSecrets(value, plainPasswords = [DEFAULT_PASSWORD]) {
    const found = [];
    const visit = (node, path) => {
        if (typeof node === "string") {
            if (BCRYPT_HASH.test(node) || plainPasswords.includes(node)) {
                found.push(path || "(raiz)");
            }
            return;
        }
        if (Array.isArray(node)) {
            node.forEach((item, index) => visit(item, `${path}[${index}]`));
            return;
        }
        if (node && typeof node === "object" && !(node instanceof Date)) {
            for (const [key, child] of Object.entries(node)) {
                const childPath = path ? `${path}.${key}` : key;
                if (SECRET_KEYS.has(key)) {
                    found.push(childPath);
                }
                visit(child, childPath);
            }
        }
    };
    visit(value, "");
    return found;
}
