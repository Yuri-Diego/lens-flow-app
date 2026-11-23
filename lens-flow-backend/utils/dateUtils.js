/**
 * Datas do negócio (RN-06, T8). O dia da folha é calculado no servidor, no
 * fuso America/Sao_Paulo, com Intl e sem deslocamento fixo (-03:00): se o
 * horário de verão voltar, a base de fusos do Intl acompanha.
 *
 * Uma "data de folha" é o texto AAAA-MM-DD do dia no fuso da empresa. As
 * contas entre datas de folha usam a meia-noite UTC de cada uma, que nunca
 * tem horário de verão, então a diferença em dias é sempre exata.
 */

import { clock } from "./clock.js";

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const SHEET_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

/** Ano, mês, dia, hora, minuto e segundo do instante no fuso da empresa. */
function zonedParts(instant) {
    const parts = {};
    for (const { type, value } of zonedFormatter.formatToParts(instant)) {
        if (type !== "literal") {
            parts[type] = Number(value);
        }
    }
    return parts;
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function utcMidnight(sheetDate) {
    const [, year, month, day] = SHEET_DATE.exec(sheetDate).map(Number);
    return Date.UTC(year, month - 1, day);
}

/** A data da folha (AAAA-MM-DD) do instante, no fuso da empresa. */
export function sheetDateOf(instant = clock.now()) {
    const { year, month, day } = zonedParts(instant);
    return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/** Texto AAAA-MM-DD que é uma data de calendário de verdade (sem 2026-02-30). */
export function isValidSheetDate(value) {
    const match = typeof value === "string" ? SHEET_DATE.exec(value) : null;
    if (!match) {
        return false;
    }
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    );
}

/** Dias de calendário de `from` até `to` (negativo se `to` vier antes). */
export function daysBetween(from, to) {
    return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

export function addDays(sheetDate, days) {
    return new Date(utcMidnight(sheetDate) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "22/11", para as mensagens. */
export function dayMonth(sheetDate) {
    return `${sheetDate.slice(8, 10)}/${sheetDate.slice(5, 7)}`;
}

/** Diferença, em ms, entre o relógio do fuso e o UTC naquele instante. */
function zoneOffsetAt(epochMs) {
    const parts = zonedParts(new Date(epochMs));
    const wallAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );
    return wallAsUtc - Math.floor(epochMs / 1000) * 1000;
}

/**
 * O instante da hora local `hour:minute` no dia da folha, no fuso da empresa.
 *
 * Parte do deslocamento do fuso perto do horário de parede e confere se o
 * resultado mostra mesmo aquela hora. Se a hora não existe (o salto do início
 * do horário de verão, que no Brasil era à meia-noite), devolve o primeiro
 * instante depois do salto: o dia começa à 01:00 local.
 */
export function zonedTimeToInstant(sheetDate, hour = 0, minute = 0) {
    const wall = utcMidnight(sheetDate) + (hour * 60 + minute) * 60 * 1000;
    const guess = wall - zoneOffsetAt(wall);
    const offset = zoneOffsetAt(guess);
    const candidate = wall - offset;
    if (zoneOffsetAt(candidate) === offset) {
        return new Date(candidate);
    }
    return new Date(Math.max(guess, candidate));
}

/** O instante em que o dia começa (meia-noite no fuso da empresa). */
export function startOfSheetDate(sheetDate) {
    return zonedTimeToInstant(sheetDate, 0, 0);
}

/**
 * Período de datas de folha como intervalo de instantes [início, fim), para
 * filtrar campos de data e hora (hora da baixa, histórico).
 */
export function instantRange(from, to) {
    const range = {};
    if (from) {
        range.$gte = startOfSheetDate(from);
    }
    if (to) {
        range.$lt = startOfSheetDate(addDays(to, 1));
    }
    return range;
}
