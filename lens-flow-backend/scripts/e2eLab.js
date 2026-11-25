import { randomBytes } from "node:crypto";
import { Box, Business, User } from "../models/index.js";
import { createBoxesBatch } from "../services/boxService.js";
import { checkoutMovement, launchMovement } from "../services/movementService.js";
import { hashPassword } from "../services/passwordService.js";
import { createUser } from "../services/userService.js";
import { addDays, sheetDateOf, zonedTimeToInstant } from "../utils/dateUtils.js";
import { applyClockAt } from "./e2eClock.js";

/**
 * O conjunto fixo do E2E: um laboratório (empresa) com um admin, dois
 * operadores, caixas de todas as cores e pendentes de dias anteriores.
 *
 * Tudo entra pelos services da API, na hora de cada ação (e2eClock.js). Por
 * isso as folhas, o estado das caixas, o histórico e o resumo de clientes
 * (D24) ficam como em produção, sem nada gravado direto no banco.
 */

const PEOPLE = {
    admin: { name: "Adriana Admin", role: "admin" },
    ana: { name: "Ana Souza", role: "operator" },
    joao: { name: "João Lima", role: "operator" },
};

const BOXES = {
    branca: ["1", "2", "7", "007", "10"],
    preta: ["20", "21"],
    verde: ["30", "31"],
    amarela: ["40", "41"],
    vermelha: ["50", "51", "52"],
    azul: ["60", "61"],
};

/** `daysAgo` e `hour` dizem quando o serviço foi lançado. */
const MOVEMENTS = [
    { box: "40", daysAgo: 3, hour: 9, by: "joao", clientName: "Ótica Popular", orderService: "4400" },
    { box: "60", daysAgo: 2, hour: 9, by: "ana", clientName: "Ótica Íris", orderService: "4450" },
    { box: "10", daysAgo: 1, hour: 8, by: "ana", clientName: "Ótica São João", orderService: "4590" },
    { box: "2", daysAgo: 1, hour: 9, by: "ana", clientName: "Ótica Central", orderService: "4521" },
    { box: "20", daysAgo: 1, hour: 10, by: "ana", clientName: "Óticas Primavera", orderService: "A-77" },
    { box: "30", daysAgo: 1, hour: 11, by: "joao", clientName: "Ótica Visão Clara", orderService: "4600" },
    { box: "50", daysAgo: 1, hour: 12, by: "ana", clientName: "Ótica Bela Vista", orderService: "4700" },
    // Saiu ontem e ninguém liberou a caixa (R15).
    { box: "21", daysAgo: 1, hour: 13, by: "ana", clientName: "Ótica Cristal", orderService: "4800", outBy: "joao", outHour: 17 },
];

/** Prefixo novo para os usuários, que são únicos entre todas as empresas. */
export function newLabPrefix() {
    return `e2e-${randomBytes(5).toString("hex")}`;
}

/** Cria um laboratório e devolve o que os testes precisam para usá-lo. */
export async function seedLab({ prefix, password }) {
    const today = sheetDateOf();
    const business = await Business.create({ name: `Laboratório ${prefix}` });

    const adminUser = await User.create({
        business: business._id,
        name: PEOPLE.admin.name,
        username: `${prefix}-admin`,
        passwordHash: await hashPassword(password),
        role: "admin",
    });
    const authOf = (user, role) => ({
        userId: String(user._id ?? user.id),
        businessId: String(business._id),
        role,
    });
    const auth = { admin: authOf(adminUser, "admin") };
    const users = {
        admin: { id: String(adminUser._id), name: adminUser.name, username: adminUser.username, password },
    };
    for (const key of ["ana", "joao"]) {
        const { name, role } = PEOPLE[key];
        const user = await createUser(auth.admin, { name, username: `${prefix}-${key}`, password, role });
        auth[key] = authOf(user, role);
        users[key] = { id: user.id, name, username: user.username, password };
    }

    for (const [color, numbers] of Object.entries(BOXES)) {
        await createBoxesBatch(auth.admin, { color, numbers });
    }
    const rows = await Box.find({ business: business._id }).select("number").lean();
    const boxes = Object.fromEntries(rows.map((box) => [box.number, String(box._id)]));

    const movements = {};
    for (const item of MOVEMENTS) {
        const date = addDays(today, -item.daysAgo);
        const { movement } = await applyClockAt(zonedTimeToInstant(date, item.hour), () =>
            launchMovement(auth[item.by], {
                boxId: boxes[item.box],
                clientName: item.clientName,
                orderService: item.orderService,
            })
        );
        if (item.outBy) {
            await applyClockAt(zonedTimeToInstant(date, item.outHour), () =>
                checkoutMovement(auth[item.outBy], movement.id)
            );
        }
        movements[item.box] = movement.id;
    }

    return { business: { id: String(business._id), name: business.name }, today, users, boxes, movements };
}
