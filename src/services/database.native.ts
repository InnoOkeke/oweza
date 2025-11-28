import { InMemoryDatabase } from "./database.shared";

const inMemoryInstance = new InMemoryDatabase();

export const db = inMemoryInstance;

export const getDatabase = async () => inMemoryInstance;
