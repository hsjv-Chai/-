CREATE TABLE `email_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical` text NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`code_hash` text NOT NULL,
	`transport` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`wrong_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_by` text,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE INDEX `email_challenge_canonical_idx` ON `email_challenges` (`canonical`,`created_at`);--> statement-breakpoint
CREATE TABLE `email_quotas` (
	`canonical` text PRIMARY KEY NOT NULL,
	`registered_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_send_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical` text NOT NULL,
	`ip` text,
	`day` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `email_attempt_canonical_idx` ON `email_send_attempts` (`canonical`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_attempt_ip_idx` ON `email_send_attempts` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_attempt_day_idx` ON `email_send_attempts` (`day`);--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_canonical` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email_canonical`);
--> statement-breakpoint
CREATE TRIGGER email_registration_guard BEFORE INSERT ON users
WHEN NEW.email IS NOT NULL OR NEW.email_canonical IS NOT NULL OR NEW.email_verified_at IS NOT NULL
BEGIN
 SELECT CASE WHEN NEW.email IS NULL OR NEW.email_canonical IS NULL OR NEW.email_verified_at IS NULL OR NOT EXISTS(
   SELECT 1 FROM email_challenges WHERE consumed_by=NEW.id AND canonical=NEW.email_canonical AND status='consumed'
 ) THEN RAISE(ABORT,'EMAIL_VERIFICATION_REQUIRED') END;
 SELECT CASE WHEN COALESCE((SELECT registered_count FROM email_quotas WHERE canonical=NEW.email_canonical),0)>=10 THEN RAISE(ABORT,'EMAIL_QUOTA_FULL') END;
END;
--> statement-breakpoint
CREATE TRIGGER email_registration_count AFTER INSERT ON users WHEN NEW.email_canonical IS NOT NULL
BEGIN
 INSERT INTO email_quotas(canonical,registered_count) VALUES(NEW.email_canonical,1)
 ON CONFLICT(canonical) DO UPDATE SET registered_count=registered_count+1;
END;
--> statement-breakpoint
CREATE TRIGGER email_quota_insert_guard BEFORE INSERT ON email_quotas WHEN NEW.registered_count<0 OR NEW.registered_count>10
BEGIN SELECT RAISE(ABORT,'EMAIL_QUOTA_FULL'); END;
--> statement-breakpoint
CREATE TRIGGER email_quota_update_guard BEFORE UPDATE ON email_quotas WHEN NEW.registered_count<OLD.registered_count OR NEW.registered_count>10
BEGIN SELECT RAISE(ABORT,'EMAIL_QUOTA_FULL'); END;
--> statement-breakpoint
CREATE TRIGGER email_binding_immutable BEFORE UPDATE OF email,email_canonical,email_verified_at ON users
WHEN NEW.email IS NOT OLD.email OR NEW.email_canonical IS NOT OLD.email_canonical OR NEW.email_verified_at IS NOT OLD.email_verified_at
BEGIN SELECT RAISE(ABORT,'EMAIL_IMMUTABLE'); END;
