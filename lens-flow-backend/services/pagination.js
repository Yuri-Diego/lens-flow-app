import mongoose from "mongoose";
import { validationError } from "../utils/errors.js";

/**
 * Paginação por cursor (keyset): a página seguinte começa depois do último
 * item, nos campos da ordenação, sem `skip`. Cada página custa o mesmo, por
 * mais longe que esteja, e um item novo não duplica nem esconde outro.
 *
 * Uma ordenação é uma lista de campos { field, dir, type }, sempre terminando
 * em `_id`, que desempata. O cursor é opaco para o web: base64url de
 * { s: nome da ordenação, v: valores do último item }.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const MAX_TEXT_VALUE = 64;

export function sortField(field, dir, type) {
    return Object.freeze({ field, dir, type });
}

/** O `sort` do Mongo, com os campos na ordem da especificação. */
function mongoSort(spec) {
    return Object.fromEntries(spec.map(({ field, dir }) => [field, dir]));
}

function readField(doc, field) {
    return field.split(".").reduce((value, key) => value?.[key], doc);
}

function encodeValue(value, type) {
    if (type === "date") {
        return new Date(value).toISOString();
    }
    if (type === "objectId") {
        return String(value);
    }
    return value;
}

function decodeValue(value, type) {
    switch (type) {
        case "date": {
            const date = typeof value === "string" ? new Date(value) : null;
            return date && !Number.isNaN(date.getTime()) ? date : undefined;
        }
        case "objectId":
            return typeof value === "string" && OBJECT_ID.test(value)
                ? new mongoose.Types.ObjectId(value)
                : undefined;
        case "boolean":
            return typeof value === "boolean" ? value : undefined;
        case "string":
            return typeof value === "string" && value.length <= MAX_TEXT_VALUE ? value : undefined;
        default:
            return undefined;
    }
}

export function encodeCursor(sortName, spec, doc) {
    const values = spec.map(({ field, type }) => encodeValue(readField(doc, field), type));
    return Buffer.from(JSON.stringify({ s: sortName, v: values })).toString("base64url");
}

function invalidCursor() {
    return validationError(
        { cursor: "Cursor inválido. Recarregue a lista." },
        "Cursor inválido. Recarregue a lista."
    );
}

/** Os valores do cursor, já convertidos; 400 se ele não for desta ordenação. */
function decodeCursor(cursor, sortName, spec) {
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
        throw invalidCursor();
    }
    if (
        !parsed ||
        parsed.s !== sortName ||
        !Array.isArray(parsed.v) ||
        parsed.v.length !== spec.length
    ) {
        throw invalidCursor();
    }
    const values = spec.map(({ type }, index) => decodeValue(parsed.v[index], type));
    if (values.some((value) => value === undefined)) {
        throw invalidCursor();
    }
    return values;
}

/**
 * Filtro "depois do cursor". A borda do primeiro campo ($gte/$lte) dá limites
 * ao índice; o $or desempata os itens com o mesmo valor nos primeiros campos.
 */
function afterCursorFilter(spec, values) {
    const branches = spec.map(({ field, dir }, index) => {
        const branch = {};
        for (let previous = 0; previous < index; previous += 1) {
            branch[spec[previous].field] = values[previous];
        }
        branch[field] = { [dir === 1 ? "$gt" : "$lt"]: values[index] };
        return branch;
    });
    const first = spec[0];
    return {
        $and: [{ [first.field]: { [first.dir === 1 ? "$gte" : "$lte"]: values[0] } }, { $or: branches }],
    };
}

/**
 * A consulta de uma página, sem executar (o explain dos testes usa esta mesma
 * consulta). Pede um item a mais para saber se há próxima página.
 * `buildQuery(filter)` monta a consulta do model (find, select...).
 */
export function pageQuery({ filter, spec, sortName, cursor, limit, buildQuery }) {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("A página precisa de um limite inteiro positivo.");
    }
    const pageFilter = cursor
        ? { $and: [filter, afterCursorFilter(spec, decodeCursor(cursor, sortName, spec))] }
        : filter;
    return buildQuery(pageFilter).sort(mongoSort(spec)).limit(limit + 1);
}

/** Executa a consulta da página e calcula o cursor da próxima. */
export async function findPage(options) {
    const docs = await pageQuery(options).lean();
    const page = docs.slice(0, options.limit);
    const nextCursor =
        docs.length > options.limit ? encodeCursor(options.sortName, options.spec, page.at(-1)) : null;
    return { docs: page, nextCursor };
}
