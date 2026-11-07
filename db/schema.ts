import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const staff = sqliteTable('staff',{ mac:text('mac').primaryKey(), name:text('name').notNull(), mobile:text('mobile').unique(), pairHash:text('pair_hash'), pairExpires:integer('pair_expires') });
export const events = sqliteTable('events',{ id:integer('id').primaryKey(), mac:text('mac').notNull(), at:integer('at').notNull(), online:integer('online').notNull() });
export const sync = sqliteTable('sync',{ pairIp:text('pair_ip'), id:integer('id').primaryKey(), at:integer('at').notNull() });
