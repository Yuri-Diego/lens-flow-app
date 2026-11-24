/**
 * Sugestões de cliente (D24, R12): o cliente é a ótica que manda o serviço, e
 * o mesmo nome se repete. O lançamento sugere os nomes já usados na empresa
 * enquanto a pessoa digita.
 */
export const CLIENT_SUGGESTIONS = Object.freeze({
    defaultLimit: 8,
    maxLimit: 20,
    // Tamanho máximo da busca, depois de tirar os espaços das pontas. É o
    // mesmo corte que o web faz no campo Cliente.
    maxQueryLength: 80,
});
