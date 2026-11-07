CREATE TABLE `events` (
	`id` integer PRIMARY KEY NOT NULL,
	`mac` text NOT NULL,
	`at` integer NOT NULL,
	`online` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`mac` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync` (
	`id` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
