// Apaga e recria o esquema público do banco de DESENVOLVIMENTO. Recusa rodar em produção.
import "dotenv/config";
import { Pool } from "pg";

if (process.env.NODE_ENV === "production") throw new Error("não roda em produção");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("drop schema public cascade; create schema public;")
  .then(() => console.log("banco zerado"))
  .finally(() => pool.end());
