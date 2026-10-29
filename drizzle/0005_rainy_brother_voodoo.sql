CREATE TABLE `museum_exhibitions` (
	`id` text PRIMARY KEY NOT NULL,
	`draft` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mutation_token` text,
	`live_release_id` text,
	`is_public` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE TABLE `museum_images` (
	`id` text PRIMARY KEY NOT NULL,
	`exhibition_id` text NOT NULL,
	`mime` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`exhibition_id`) REFERENCES `museum_exhibitions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `museum_items` (
	`id` text PRIMARY KEY NOT NULL,
	`exhibition_id` text NOT NULL,
	`content` text NOT NULL,
	`position` integer NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`exhibition_id`) REFERENCES `museum_exhibitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `museum_items_exhibition_idx` ON `museum_items` (`exhibition_id`,`removed`,`position`);--> statement-breakpoint
CREATE TABLE `museum_release_items` (
	`release_id` text NOT NULL,
	`item_id` text NOT NULL,
	`position` integer NOT NULL,
	`content` text NOT NULL,
	PRIMARY KEY(`release_id`, `item_id`),
	FOREIGN KEY (`release_id`) REFERENCES `museum_releases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `museum_release_item_idx` ON `museum_release_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `museum_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`exhibition_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`exhibition_id`) REFERENCES `museum_exhibitions`(`id`) ON UPDATE no action ON DELETE no action
);
