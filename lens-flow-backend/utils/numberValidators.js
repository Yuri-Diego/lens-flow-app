import z from 'zod';

const positiveNumberSchema = z.number().positive();

export function isPositiveNumber(value) {
    const result = positiveNumberSchema.safeParse(value);
    return result.success;
}
