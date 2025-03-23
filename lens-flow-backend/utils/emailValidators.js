import { z } from 'zod';

const emailSchema = z.string().email();

export const isValidEmail = (email) => {
    return emailSchema.safeParse(email).success;
}

