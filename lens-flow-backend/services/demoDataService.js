import mongoose from "mongoose";
import { categoryForColor } from "../domain/boxColors.js";
import { normalizeSearchText } from "../domain/text.js";
import AuditEvent from "../models/AuditEvent.js";
import Box from "../models/Box.js";
import Business from "../models/Business.js";
import Movement, { boxPlacement } from "../models/Movement.js";
import MovementSheet from "../models/MovementSheet.js";
import User from "../models/User.js";
import { addDays, sheetDateOf, startOfSheetDate, zonedTimeToInstant } from "../utils/dateUtils.js";
import { rebuildClientNames } from "./clientService.js";

/**
 * Dados de demonstração (npm run seed:demo, R18): cerca de um ano de serviços
 * de uma empresa nova, no volume de um perfil, terminando num estado
 * realista: a Conferência com N pendentes espalhados pelos últimos dias
 * (todos os níveis de atraso), alguns serviços que saíram e esperam a
 * liberação, e o histórico de cada ação.
 *
 * Os documentos são montados já consistentes (folhas, snapshots, estado das
 * caixas, histórico) e gravados em blocos com o driver, sem uma transação por
 * serviço: 219 mil serviços do perfil "estresse" levam segundos, não horas.
 * A memória fica limitada ao bloco em montagem.
 */

export const DEMO_PROFILES = Object.freeze({ base: 60, alto: 150, estresse: 600 });

const CHUNK_SIZE = 5_000;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Parte dos pendentes em cada dia, de hoje para trás: todos os níveis de atraso aparecem.
const OPEN_SHARES = [0.3, 0.22, 0.15, 0.11, 0.08, 0.06, 0.05, 0.03];
const NOT_RELEASED_SHARES = [0.5, 0.3, 0.2];

// Proporção aproximada das cores numa prateleira; a vermelha (urgente) é a menor.
const COLOR_PATTERN = [
    "branca",
    "preta",
    "verde",
    "branca",
    "amarela",
    "azul",
    "preta",
    "verde",
    "branca",
    "vermelha",
];

const CLIENT_PREFIXES = ["Ótica", "Óptica", "Ótica e Relojoaria", "Óticas", "Ótica Visão"];
const CLIENT_NAMES = [
    "Central",
    "São João",
    "Bela Vista",
    "Nossa Senhora Aparecida",
    "Santa Luzia",
    "Popular",
    "do Povo",
    "Avenida",
    "Primavera",
    "Cristal",
    "Brasil",
    "Ideal",
    "Moderna",
    "Estrela",
    "Paraíso",
    "Itaú",
    "Jardim",
    "Lumière",
    "Foco",
    "Nitidez",
    "Olhar",
    "Prisma",
    "Íris",
    "Visão Total",
];
const PATIENTS = [
    "Maria da Silva",
    "José Antônio Souza",
    "Ana Paula Ferreira",
    "João Pedro Lima",
    "Francisca Gonçalves",
    "Antônio Carlos Pereira",
];
const NOTES = ["aguardando armação", "refação", "cliente com pressa", "lente especial", "conferir grau"];

/** Gerador pseudoaleatório com semente (mulberry32): a mesma semente, os mesmos dados. */
function seededRandom(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(random, list) {
    return list[Math.floor(random() * list.length)];
}

function between(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
}

/** Quantos pendentes (e quantos saíram sem liberar) ficam em cada dia, de hoje para trás. */
export function planHolding({ perDay, days, openTarget, notReleasedTarget }) {
    const open = new Array(days).fill(0);
    let remaining = Math.min(openTarget, perDay * days);
    let carry = 0;
    for (let daysAgo = 0; daysAgo < days && remaining > 0; daysAgo += 1) {
        const share = OPEN_SHARES[daysAgo];
        const wanted =
            share === undefined ? remaining : Math.round(share * openTarget) + carry;
        const taken = Math.min(perDay, wanted, remaining);
        open[daysAgo] = taken;
        carry = wanted - taken;
        remaining -= taken;
    }
    // Com poucos dias, o que sobrou vai para os dias mais recentes que ainda têm lugar.
    for (let daysAgo = 0; daysAgo < days && remaining > 0; daysAgo += 1) {
        const taken = Math.min(perDay - open[daysAgo], remaining);
        open[daysAgo] += taken;
        remaining -= taken;
    }
    const notReleased = new Array(days).fill(0);
    let left = notReleasedTarget;
    for (let daysAgo = 0; daysAgo < days && left > 0; daysAgo += 1) {
        const share = NOT_RELEASED_SHARES[daysAgo] ?? 1;
        const wanted = Math.max(1, Math.round(share * notReleasedTarget));
        const taken = Math.min(perDay - open[daysAgo], wanted, left);
        notReleased[daysAgo] = taken;
        left -= taken;
    }
    return { open, notReleased };
}

class ChunkedWriter {
    constructor(model) {
        this.collection = model.collection;
        this.buffer = [];
        this.written = 0;
    }

    async add(doc) {
        this.buffer.push(doc);
        if (this.buffer.length >= CHUNK_SIZE) {
            await this.flush();
        }
    }

    async flush() {
        if (this.buffer.length === 0) {
            return;
        }
        const docs = this.buffer;
        this.buffer = [];
        await this.collection.insertMany(docs, { ordered: true });
        this.written += docs.length;
    }
}

function event(businessId, user, action, entity, entityId, at, before, after) {
    return {
        _id: new mongoose.Types.ObjectId(),
        business: businessId,
        user,
        action,
        entity,
        entityId,
        before: before ?? null,
        after: after ?? null,
        at,
    };
}

/**
 * Gera os dados de demonstração numa empresa nova.
 *
 * @param {object} options
 * @param {number} options.perDay serviços lançados por dia
 * @param {number} options.days quantos dias, terminando hoje
 * @param {number} options.openTarget pendentes na Conferência no fim
 * @param {number} options.notReleasedTarget serviços que saíram e esperam a liberação
 * @param {string} options.passwordHash hash bcrypt da senha dos usuários de demonstração
 * @param {Date} [options.now] o "agora" (nada é gerado depois dele)
 * @param {number} [options.seed] semente do gerador
 */
export async function generateDemoData({
    perDay,
    days,
    openTarget,
    notReleasedTarget,
    passwordHash,
    now = new Date(),
    seed = 2026,
    businessName = "Laboratório Demonstração",
}) {
    const random = seededRandom(seed);
    const today = sheetDateOf(now);
    const firstDate = addDays(today, -(days - 1));
    const setupAt = new Date(startOfSheetDate(firstDate).getTime() - HOUR);

    const business = await Business.create({ name: businessName, createdAt: setupAt });
    const businessId = business._id;

    const people = [
        { username: "demo-admin", name: "Admin Demonstração", role: "admin" },
        { username: "demo-ana", name: "Ana Souza", role: "operator" },
        { username: "demo-joao", name: "João Lima", role: "operator" },
        { username: "demo-maria", name: "Maria Ferreira", role: "operator" },
        { username: "demo-pedro", name: "Pedro Santos", role: "operator" },
    ];
    const users = people.map((person) => ({
        _id: new mongoose.Types.ObjectId(),
        business: businessId,
        ...person,
        passwordHash,
        active: true,
        failedLogins: 0,
        lockedUntil: null,
        lastLoginAt: null,
        sessionVersion: 0,
        createdAt: setupAt,
        updatedAt: setupAt,
    }));
    await User.collection.insertMany(users);
    const admin = users[0];
    const operators = users.slice(1);

    const plan = planHolding({ perDay, days, openTarget, notReleasedTarget });
    const holdingTotal =
        plan.open.reduce((sum, count) => sum + count, 0) +
        plan.notReleased.reduce((sum, count) => sum + count, 0);
    const boxCount = Math.max(400, holdingTotal + Math.min(perDay, 200) + 50);
    const boxes = Array.from({ length: boxCount }, (_, index) => {
        const number = String(index + 1);
        const color = COLOR_PATTERN[index % COLOR_PATTERN.length];
        return {
            _id: new mongoose.Types.ObjectId(),
            business: businessId,
            number,
            color,
            category: categoryForColor(color),
            state: "free",
            currentMovement: null,
            lastMovement: null,
            active: true,
            createdAt: setupAt,
            updatedAt: setupAt,
        };
    });
    // As primeiras caixas ficam com os pendentes do fim; as outras rodam no histórico.
    const holdingBoxes = boxes.slice(0, holdingTotal);
    const rotatingBoxes = boxes.slice(holdingTotal);

    const audits = new ChunkedWriter(AuditEvent);
    await audits.add(
        event(businessId, null, "business.create", "Business", businessId, setupAt, null, {
            name: businessName,
        })
    );
    for (const user of users) {
        await audits.add(
            event(businessId, null, "user.create", "User", user._id, setupAt, null, {
                name: user.name,
                username: user.username,
                role: user.role,
                active: true,
            })
        );
    }
    for (const box of boxes) {
        await audits.add(
            event(businessId, admin._id, "box.create", "Box", box._id, setupAt, null, {
                number: box.number,
                color: box.color,
                category: box.category,
                state: "free",
                active: true,
            })
        );
    }

    const movements = new ChunkedWriter(Movement);
    const sheets = new ChunkedWriter(MovementSheet);
    let holdingIndex = 0;
    let rotatingIndex = 0;
    let orderService = 10_000;
    const recentOpenOrders = [];
    const totals = { movements: 0, open: 0, notReleased: 0, released: 0 };

    for (let daysAgo = days - 1; daysAgo >= 0; daysAgo -= 1) {
        const date = addDays(today, -daysAgo);
        const dayStart = zonedTimeToInstant(date, 8, 0).getTime();
        const dayEnd = Math.min(zonedTimeToInstant(date, 18, 0).getTime(), now.getTime() - MINUTE);
        const earliest = Math.min(dayStart, Math.max(startOfSheetDate(date).getTime(), dayEnd - HOUR));
        const launchTimes = Array.from({ length: perDay }, () =>
            between(random, earliest, Math.max(earliest, dayEnd))
        ).sort((a, b) => a - b);

        const sheetId = new mongoose.Types.ObjectId();
        const sheetCreatedAt = new Date(launchTimes[0] ?? dayStart);
        await sheets.add({
            _id: sheetId,
            business: businessId,
            date,
            createdAt: sheetCreatedAt,
            updatedAt: sheetCreatedAt,
        });
        await audits.add(
            event(businessId, operators[0]._id, "sheet.create", "MovementSheet", sheetId, sheetCreatedAt, null, {
                date,
            })
        );

        const openToday = plan.open[daysAgo];
        const notReleasedToday = plan.notReleased[daysAgo];
        // Os últimos lançados do dia são os que ficam pendentes.
        const firstOpen = perDay - openToday;
        const firstNotReleased = firstOpen - notReleasedToday;

        for (let index = 0; index < perDay; index += 1) {
            const createdAt = new Date(launchTimes[index]);
            const holdsOpen = index >= firstOpen;
            const holdsOut = !holdsOpen && index >= firstNotReleased;
            const box = holdsOpen || holdsOut
                ? holdingBoxes[holdingIndex++]
                : rotatingBoxes[rotatingIndex++ % rotatingBoxes.length];
            const creator = pick(random, operators);
            const client =
                random() < 0.85
                    ? `${pick(random, CLIENT_PREFIXES)} ${pick(random, CLIENT_NAMES)}`
                    : pick(random, PATIENTS);
            orderService += 1;
            let order = String(orderService);
            // D16: de vez em quando a mesma OS em dois pendentes.
            if (holdsOpen && recentOpenOrders.length > 0 && random() < 0.02) {
                order = pick(random, recentOpenOrders);
            } else if (holdsOpen) {
                recentOpenOrders.push(order);
            }

            const movementId = new mongoose.Types.ObjectId();
            const doc = {
                _id: movementId,
                business: businessId,
                sheet: sheetId,
                sheetDate: date,
                box: box._id,
                ...boxPlacement(box),
                clientName: client,
                clientNameNormalized: normalizeSearchText(client),
                orderService: order,
                note: random() < 0.1 ? pick(random, NOTES) : null,
                status: "open",
                createdBy: creator._id,
                outBy: null,
                outAt: null,
                boxReleasedBy: null,
                boxReleasedAt: null,
                updatedBy: null,
                deletedBy: null,
                deletedAt: null,
                clientRequestId: null,
                createdAt,
                updatedAt: createdAt,
            };
            await audits.add(
                event(businessId, creator._id, "movement.create", "Movement", movementId, createdAt, null, {
                    sheetDate: date,
                    box: { id: box._id, ...doc.boxSnapshot },
                    clientName: client,
                    orderService: order,
                    note: doc.note,
                })
            );

            if (!holdsOpen) {
                const latestOut = now.getTime() - 2 * MINUTE;
                const outAt = new Date(
                    Math.min(
                        latestOut,
                        createdAt.getTime() + between(random, 2 * HOUR, 26 * HOUR)
                    )
                );
                const outBy = pick(random, users);
                Object.assign(doc, { status: "out", outBy: outBy._id, outAt, updatedAt: outAt });
                await audits.add(
                    event(businessId, outBy._id, "movement.checkout", "Movement", movementId, outAt, { status: "open" }, {
                        status: "out",
                        outAt,
                    })
                );
                if (!holdsOut) {
                    const releasedAt = new Date(
                        Math.min(now.getTime() - MINUTE, outAt.getTime() + between(random, MINUTE, 10 * MINUTE))
                    );
                    const releasedBy = random() < 0.8 ? outBy : pick(random, users);
                    Object.assign(doc, {
                        boxReleasedBy: releasedBy._id,
                        boxReleasedAt: releasedAt,
                        updatedAt: releasedAt,
                    });
                    await audits.add(
                        event(
                            businessId,
                            releasedBy._id,
                            "movement.release_box",
                            "Movement",
                            movementId,
                            releasedAt,
                            { boxReleasedAt: null },
                            { boxReleasedAt: releasedAt, box: { id: box._id, ...doc.boxSnapshot } }
                        )
                    );
                }
            }

            box.lastMovement = movementId;
            if (holdsOpen || holdsOut) {
                box.state = "occupied";
                box.currentMovement = movementId;
                box.updatedAt = createdAt;
            }
            totals.movements += 1;
            if (holdsOpen) {
                totals.open += 1;
            } else if (holdsOut) {
                totals.notReleased += 1;
            } else {
                totals.released += 1;
            }
            await movements.add(doc);
        }
    }

    await Box.collection.insertMany(boxes);
    await Promise.all([movements.flush(), sheets.flush(), audits.flush()]);
    // Os serviços foram gravados direto no banco: o resumo dos nomes de cliente
    // (sugestões, D24) é feito a partir deles.
    const clientNames = await rebuildClientNames(businessId);

    return {
        businessId: String(businessId),
        adminId: String(admin._id),
        usernames: users.map((user) => user.username),
        firstDate,
        lastDate: today,
        boxes: boxes.length,
        sheets: sheets.written,
        auditEvents: audits.written,
        clientNames,
        ...totals,
    };
}
