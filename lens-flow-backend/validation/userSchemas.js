import { ROLES } from "../domain/enums.js";
import { atLeastOneField, booleanField, jsonBody, requiredText } from "./common.js";
import { z } from "./zod.js";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
// O bcrypt só usa os primeiros 72 bytes da senha.
const BCRYPT_MAX_BYTES = 72;

export const username = requiredText("Informe o usuário.")
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, {
        error: "Use de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado, começando por letra ou número.",
    });

export const personName = requiredText("Informe o nome.")
    .trim()
    .min(1, { error: "Informe o nome." })
    .max(80, { error: "Use no máximo 80 caracteres no nome." });

export const password = requiredText("Informe a senha.")
    .min(PASSWORD_MIN_LENGTH, {
        error: `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    })
    .max(PASSWORD_MAX_LENGTH, {
        error: `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    })
    .refine((value) => Buffer.byteLength(value, "utf8") <= BCRYPT_MAX_BYTES, {
        error: "A senha é longa demais.",
    });

export const role = z.enum(ROLES, { error: "Perfil inválido: use admin ou operator." });

export const createUserBody = jsonBody({ name: personName, username, password, role });

export const updateUserBody = atLeastOneField(
    jsonBody({
        name: personName.optional(),
        role: role.optional(),
        active: booleanField.optional(),
    })
);

export const resetPasswordBody = jsonBody({ password });
