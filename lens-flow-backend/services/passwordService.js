import bcrypt from "bcrypt";

const DEFAULT_ROUNDS = 12;
const MAX_ROUNDS = 15;

/**
 * Custo do bcrypt: 12 por padrão. BCRYPT_ROUNDS permite baixar nos testes
 * (mínimo 4) e nunca abaixo de 10 em produção.
 */
function hashRounds() {
    const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? "", 10);
    const min = process.env.NODE_ENV === "production" ? 10 : 4;
    return Number.isInteger(rounds) && rounds >= min && rounds <= MAX_ROUNDS
        ? rounds
        : DEFAULT_ROUNDS;
}

export function hashPassword(plain) {
    return bcrypt.hash(plain, hashRounds());
}

export function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

let dummy;

/**
 * Compara a senha com um hash descartável, de mesmo custo, quando o usuário
 * não existe: o tempo de resposta não revela se o usuário existe.
 */
export async function burnPasswordCheck(plain) {
    const rounds = hashRounds();
    if (!dummy || dummy.rounds !== rounds) {
        dummy = { rounds, hash: await bcrypt.hash("lens-flow-usuario-inexistente", rounds) };
    }
    await bcrypt.compare(plain, dummy.hash);
}
