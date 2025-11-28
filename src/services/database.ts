import mongoDatabase from "./mongoDatabase";
import { InMemoryDatabase } from "./database.shared";

const useMongoDb = Boolean(process.env.MONGODB_URI);

const inMemoryInstance = new InMemoryDatabase();

export const db = useMongoDb ? mongoDatabase : inMemoryInstance;

export const getDatabase = async () => (useMongoDb ? mongoDatabase : inMemoryInstance);
