import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

export const sequelize = new Sequelize(
  process.env.PG_DATABASE,
  process.env.PG_USER,
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    dialect: "postgres",
    logging: false,

    dialectOptions: isProduction
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  }
);

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to PostgreSQL");
    return true;
  } catch (error) {
    console.error("❌ DB connection failed:", error);
    return false;
  }
};