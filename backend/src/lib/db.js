import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const POINTS = { EASY: 10, MEDIUM: 20, HARD: 40 };
