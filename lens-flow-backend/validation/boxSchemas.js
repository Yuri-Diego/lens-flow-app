import { BOX_CATEGORY_KEYS, BOX_COLOR_KEYS } from "../domain/boxColors.js";
import { parseBoxNumber, parseBoxNumberList } from "../domain/boxNumbers.js";
import { BOX_STATES } from "../domain/enums.js";
import {
    atLeastOneField,
    booleanField,
    booleanFromQuery,
    jsonBody,
    requiredText,
} from "./common.js";
import { z } from "./zod.js";

const LIST_MAX_LENGTH = 2000;

const boxNumber = requiredText(
    "Informe o número da caixa.",
    'Envie o número da caixa como texto, por exemplo "12".'
)
    .max(20, { error: "Número de caixa inválido." })
    .transform((value, ctx) => {
        const parsed = parseBoxNumber(value);
        if (parsed.error) {
            ctx.addIssue({ code: "custom", message: parsed.error });
            return z.NEVER;
        }
        return parsed.value;
    });

const boxColor = z.enum(BOX_COLOR_KEYS, {
    error: `Cor inválida. Use uma destas: ${BOX_COLOR_KEYS.join(", ")}.`,
});

const boxCategory = z.enum(BOX_CATEGORY_KEYS, {
    error: `Categoria inválida. Use uma destas: ${BOX_CATEGORY_KEYS.join(", ")}.`,
});

const boxState = z.enum(BOX_STATES, { error: "Estado inválido: use free ou occupied." });

// "3, 12, 27-30" ou ["3", "12", "27-30"]; vira a lista expandida de números.
const numberList = z
    .preprocess(
        (value) =>
            Array.isArray(value) && value.every((item) => typeof item === "string")
                ? value.join(",")
                : value,
        requiredText(
            'Informe os números, por exemplo "3, 12, 27-30".',
            'Envie os números como texto, por exemplo "3, 12, 27-30".'
        ).max(LIST_MAX_LENGTH, { error: "A lista de números é longa demais." })
    )
    .transform((text, ctx) => {
        const parsed = parseBoxNumberList(text);
        if (parsed.error) {
            ctx.addIssue({ code: "custom", message: parsed.error });
            return z.NEVER;
        }
        return parsed.numbers;
    });

export const createBoxBody = jsonBody({ number: boxNumber, color: boxColor });

export const batchBoxesBody = jsonBody({ color: boxColor, numbers: numberList });

export const updateBoxBody = atLeastOneField(
    jsonBody({
        number: boxNumber.optional(),
        color: boxColor.optional(),
        active: booleanField.optional(),
    })
);

export const listBoxesQuery = z.strictObject({
    state: boxState.optional(),
    color: boxColor.optional(),
    category: boxCategory.optional(),
    number: boxNumber.optional(),
    active: booleanFromQuery.optional(),
});
