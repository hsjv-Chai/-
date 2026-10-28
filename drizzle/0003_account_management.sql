CREATE TABLE `account_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_audit_user_idx` ON `account_audit` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `registration_alert_users` (
	`alert_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`alert_id`, `user_id`),
	FOREIGN KEY (`alert_id`) REFERENCES `registration_alerts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `registration_alert_user_idx` ON `registration_alert_users` (`user_id`);--> statement-breakpoint
CREATE TABLE `registration_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`ip` text NOT NULL,
	`window_start` integer NOT NULL,
	`created_at` integer NOT NULL,
	`account_count` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `registration_ip` text;--> statement-breakpoint
ALTER TABLE `users` ADD `account_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `restricted_room_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `banned_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `account_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `users_registration_ip_idx` ON `users` (`registration_ip`,`created_at`);
--> statement-breakpoint
CREATE TABLE `game_result_receipts` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE TRIGGER account_guard_post_insert BEFORE INSERT ON posts
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_post_edit BEFORE UPDATE OF title,body,category_id ON posts
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_reply_insert BEFORE INSERT ON replies
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_upload_insert BEFORE INSERT ON uploads
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_upload_attach BEFORE UPDATE OF post_id ON uploads
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_like_insert BEFORE INSERT ON likes
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_like_delete BEFORE DELETE ON likes
WHEN EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_garden_insert BEFORE INSERT ON garden_check_ins
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;

--> statement-breakpoint
CREATE TRIGGER account_guard_session_insert BEFORE INSERT ON sessions
WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status<>'active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;
