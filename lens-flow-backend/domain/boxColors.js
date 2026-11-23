/**
 * Cores das caixas e categorias de serviço (RN-03, RN-04, D3).
 *
 * Este é o único lugar com essas constantes. O banco guarda só a chave da cor;
 * a categoria é sempre derivada dela, nunca escolhida à mão. O hex de cada cor
 * é decisão de design e fica no web (B14).
 */

export const BOX_CATEGORIES = Object.freeze([
    Object.freeze({ key: "without_assembly", label: "Sem montagem" }),
    Object.freeze({ key: "with_assembly", label: "Com montagem" }),
    Object.freeze({ key: "urgent", label: "Urgente" }),
    Object.freeze({ key: "with_treatment", label: "Com tratamento" }),
]);

export const BOX_COLORS = Object.freeze([
    Object.freeze({ key: "branca", label: "Branca", category: "without_assembly" }),
    Object.freeze({ key: "preta", label: "Preta", category: "without_assembly" }),
    Object.freeze({ key: "verde", label: "Verde", category: "with_assembly" }),
    Object.freeze({ key: "amarela", label: "Amarela", category: "with_assembly" }),
    Object.freeze({ key: "vermelha", label: "Vermelha", category: "urgent" }),
    Object.freeze({ key: "azul", label: "Azul", category: "with_treatment" }),
]);

export const BOX_COLOR_KEYS = Object.freeze(BOX_COLORS.map((color) => color.key));
export const BOX_CATEGORY_KEYS = Object.freeze(BOX_CATEGORIES.map((category) => category.key));

const colorsByKey = new Map(BOX_COLORS.map((color) => [color.key, color]));
const categoriesByKey = new Map(BOX_CATEGORIES.map((category) => [category.key, category]));

/** Categoria da cor, ou undefined se a chave não for uma cor conhecida. */
export function categoryForColor(colorKey) {
    return colorsByKey.get(colorKey)?.category;
}

export function colorLabel(colorKey) {
    return colorsByKey.get(colorKey)?.label ?? colorKey;
}

export function categoryLabel(categoryKey) {
    return categoriesByKey.get(categoryKey)?.label ?? categoryKey;
}

/** Corpo do GET /api/meta/box-colors. */
export function boxColorsMeta() {
    return {
        colors: BOX_COLORS.map((color) => ({
            key: color.key,
            label: color.label,
            category: color.category,
            categoryLabel: categoryLabel(color.category),
        })),
        categories: BOX_CATEGORIES.map((category) => ({
            key: category.key,
            label: category.label,
            colors: BOX_COLORS.filter((color) => color.category === category.key).map(
                (color) => color.key
            ),
        })),
    };
}
