/** Formatos públicos do usuário. Nunca incluem senha, hash ou contadores. */

export function toPublicUser(user, now = new Date()) {
    const locked = Boolean(user.lockedUntil && user.lockedUntil > now);
    return {
        id: String(user._id),
        name: user.name,
        username: user.username,
        role: user.role,
        active: user.active,
        locked,
        lockedUntil: locked ? user.lockedUntil : null,
        lastLoginAt: user.lastLoginAt ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

/**
 * O usuário como opção de filtro, para qualquer pessoa logada: só id, nome e
 * ativo. Sem usuário, perfil, senha nem hash.
 */
export function toUserOption(user) {
    return { id: String(user._id), name: user.name, active: user.active === true };
}

/** O usuário da sessão, para o cabeçalho do site ("Trocar usuário", D12). */
export function toSessionUser(user, business) {
    return {
        id: String(user._id),
        name: user.name,
        username: user.username,
        role: user.role,
        business: { id: String(business._id), name: business.name },
    };
}

/** O que vai para o histórico (RN-02). */
export function userAuditSnapshot(user) {
    return { name: user.name, username: user.username, role: user.role, active: user.active };
}
