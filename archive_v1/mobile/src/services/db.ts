import * as SQLite from 'expo-sqlite';

const DB_NAME = 'ai_os.db';

export const db = SQLite.openDatabaseSync(DB_NAME);

export const initDatabase = async () => {
  try {
    // Feed Blocks table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS feed_blocks (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);

    // Nutrition Logs table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS nutrition_logs (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        food_name TEXT NOT NULL,
        calories REAL NOT NULL,
        protein_g REAL,
        carbs_g REAL,
        fat_g REAL,
        timestamp INTEGER NOT NULL
      );
    `);

    // Sleep Logs table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sleep_logs (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        sleep_time TEXT,
        wake_time TEXT,
        hours_slept REAL NOT NULL,
        quality TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    // Goals table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_value REAL NOT NULL,
        current_value REAL NOT NULL DEFAULT 0,
        unit TEXT,
        deadline TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL
      );
    `);

    // Study Sessions table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS study_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        subject TEXT NOT NULL,
        topic TEXT,
        duration_minutes INTEGER NOT NULL,
        date TEXT NOT NULL,
        notes TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    // Study Flashcards table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS study_flashcards (
        id TEXT PRIMARY KEY NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        deck TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Study Notes table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS study_notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        created_at INTEGER NOT NULL
      );
    `);

    // Health Logs table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_logs (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        value TEXT,
        unit TEXT,
        note TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    // Finance Logs table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS finance_logs (
        id TEXT PRIMARY KEY NOT NULL,
        date TEXT NOT NULL,
        category TEXT,
        amount REAL NOT NULL,
        direction TEXT NOT NULL,
        description TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    // Settings table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Generic query helpers
export const queryAll = async <T>(sql: string, params: any[] = []): Promise<T[]> => {
  return await db.getAllAsync<T>(sql, params);
};

export const queryOne = async <T>(sql: string, params: any[] = []): Promise<T | null> => {
  return await db.getFirstAsync<T>(sql, params);
};

export const execute = async (sql: string, params: any[] = []) => {
  return await db.runAsync(sql, params);
};
