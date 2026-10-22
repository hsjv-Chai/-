CREATE TABLE `game_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`game` text NOT NULL,
	`phase` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `game_rooms_updated_idx` ON `game_rooms` (`updated_at`);--> statement-breakpoint
CREATE INDEX `game_rooms_owner_idx` ON `game_rooms` (`owner_id`,`created_at`);