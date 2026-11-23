import { jsonBody, requiredText } from "./common.js";
import { password } from "./userSchemas.js";

// O login não revela as regras de formato do usuário: só limita o tamanho.
export const loginBody = jsonBody({
    username: requiredText("Informe o usuário.")
        .trim()
        .toLowerCase()
        .min(1, { error: "Informe o usuário." })
        .max(100, { error: "Usuário ou senha inválidos." }),
    password: requiredText("Informe a senha.")
        .min(1, { error: "Informe a senha." })
        .max(200, { error: "Usuário ou senha inválidos." }),
});

export const changePasswordBody = jsonBody({
    currentPassword: requiredText("Informe a senha atual.")
        .min(1, { error: "Informe a senha atual." })
        .max(200, { error: "Senha atual incorreta." }),
    newPassword: password,
}).refine((value) => value.currentPassword !== value.newPassword, {
    error: "A nova senha precisa ser diferente da atual.",
    path: ["newPassword"],
});
