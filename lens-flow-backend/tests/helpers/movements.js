import { vi } from "vitest";
import request from "supertest";
import { Box } from "../../models/index.js";
import { clock } from "../../utils/clock.js";

/** Requisições com o cookie de quem está logado: api("post", "/api/...").send(...). */
export function apiAs(app, cookie) {
    return (method, path) => request(app)[method](path).set("Cookie", cookie);
}

/** Caixa livre gravada direto no banco (o cadastro pela API é testado em boxes.test.js). */
export function createBox(business, number, color = "branca", extra = {}) {
    return Box.create({ business: business._id ?? business, number, color, ...extra });
}

/** Lança um serviço pela API e falha o teste se não entrar. */
export async function launch(app, cookie, body) {
    const response = await request(app).post("/api/movements").set("Cookie", cookie).send(body);
    if (response.status !== 201) {
        throw new Error(`Lançamento falhou: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.movement;
}

/**
 * Põe o relógio das regras de negócio num instante (utils/clock.js). O Date
 * de verdade continua andando: a sessão e a conexão com o banco não sentem.
 * Desfaça com vi.restoreAllMocks() no afterEach.
 */
export function setNow(iso) {
    const instant = new Date(iso).getTime();
    vi.spyOn(clock, "now").mockImplementation(() => new Date(instant));
}

/** Um id que não existe. */
export const MISSING_ID = "0123456789abcdef01234567";
