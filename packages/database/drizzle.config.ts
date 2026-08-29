import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE_PATH ?? './data/open-career-agent.sqlite',
  },
  strict: true,
  verbose: true,
});
