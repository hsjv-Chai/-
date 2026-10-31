CREATE TABLE `coop_gardens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`creator_id` text NOT NULL,
	`owner_id` text,
	`current_round` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_watered_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `coop_gardens_activity_idx` ON `coop_gardens` (`last_watered_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `coop_members` (
	`id` text PRIMARY KEY NOT NULL,
	`coop_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`coop_id`) REFERENCES `coop_gardens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coop_member_active_unique` ON `coop_members` (`coop_id`,`user_id`) WHERE "coop_members"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX `coop_member_user_idx` ON `coop_members` (`user_id`,`left_at`);--> statement-breakpoint
CREATE TABLE `coop_memories` (
	`coop_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`awarded_at` integer NOT NULL,
	PRIMARY KEY(`coop_id`, `round_number`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coop_id`,`round_number`) REFERENCES `coop_rounds`(`coop_id`,`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `coop_memory_user_idx` ON `coop_memories` (`user_id`,`awarded_at`);--> statement-breakpoint
CREATE TABLE `coop_rounds` (
	`coop_id` text NOT NULL,
	`number` integer NOT NULL,
	`growth` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`matured_day` text,
	`matured_at` integer,
	PRIMARY KEY(`coop_id`, `number`),
	FOREIGN KEY (`coop_id`) REFERENCES `coop_gardens`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coop_growth_bounds" CHECK("coop_rounds"."growth" BETWEEN 0 AND 35)
);
--> statement-breakpoint
CREATE TABLE `coop_waters` (
	`id` text PRIMARY KEY NOT NULL,
	`coop_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coop_id`,`round_number`) REFERENCES `coop_rounds`(`coop_id`,`number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coop_water_user_day_unique` ON `coop_waters` (`user_id`,`day`);--> statement-breakpoint
CREATE INDEX `coop_water_round_idx` ON `coop_waters` (`coop_id`,`round_number`,`created_at`);
--> statement-breakpoint
-- The same constraints run in SQLite and D1, including writes racing a ban.
CREATE TRIGGER coop_create_guard BEFORE INSERT ON coop_gardens
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.creator_id AND account_status='active')
BEGIN SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED'); END;
--> statement-breakpoint
CREATE TRIGGER coop_join_guard BEFORE INSERT ON coop_members
BEGIN
  SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status='active');
  SELECT RAISE(ABORT,'COOP_MEMBERSHIP_LIMIT') WHERE (SELECT COUNT(*) FROM coop_members WHERE user_id=NEW.user_id AND left_at IS NULL)>=3;
  SELECT RAISE(ABORT,'COOP_FULL') WHERE (SELECT COUNT(*) FROM coop_members WHERE coop_id=NEW.coop_id AND left_at IS NULL)>=10;
END;
--> statement-breakpoint
CREATE TRIGGER coop_join_owner AFTER INSERT ON coop_members
BEGIN
  UPDATE coop_gardens SET owner_id=(
    SELECT m.user_id FROM coop_members m JOIN users u ON u.id=m.user_id
    WHERE m.coop_id=NEW.coop_id AND m.left_at IS NULL AND u.account_status='active' ORDER BY m.joined_at,m.id LIMIT 1
  ) WHERE id=NEW.coop_id AND NOT EXISTS(
    SELECT 1 FROM coop_members m JOIN users u ON u.id=m.user_id WHERE m.coop_id=NEW.coop_id AND m.user_id=coop_gardens.owner_id AND m.left_at IS NULL AND u.account_status='active'
  );
END;
--> statement-breakpoint
CREATE TRIGGER coop_leave_guard BEFORE UPDATE OF left_at ON coop_members
WHEN OLD.left_at IS NULL AND NEW.left_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status='active');
END;
--> statement-breakpoint
CREATE TRIGGER coop_leave_owner AFTER UPDATE OF left_at ON coop_members
WHEN OLD.left_at IS NULL AND NEW.left_at IS NOT NULL
BEGIN
  UPDATE coop_gardens SET owner_id=(
    SELECT m.user_id FROM coop_members m JOIN users u ON u.id=m.user_id
    WHERE m.coop_id=NEW.coop_id AND m.left_at IS NULL AND u.account_status='active' ORDER BY m.joined_at,m.id LIMIT 1
  ) WHERE id=NEW.coop_id AND NOT EXISTS(
    SELECT 1 FROM coop_members m JOIN users u ON u.id=m.user_id WHERE m.coop_id=NEW.coop_id AND m.user_id=coop_gardens.owner_id AND m.left_at IS NULL AND u.account_status='active'
  );
END;
--> statement-breakpoint
CREATE TRIGGER coop_account_owner AFTER UPDATE OF account_status ON users
BEGIN
  UPDATE coop_gardens SET owner_id=(
    SELECT m.user_id FROM coop_members m JOIN users u ON u.id=m.user_id
    WHERE m.coop_id=coop_gardens.id AND m.left_at IS NULL AND u.account_status='active' ORDER BY m.joined_at,m.id LIMIT 1
  ) WHERE id IN(SELECT coop_id FROM coop_members WHERE user_id=NEW.id AND left_at IS NULL)
    AND NOT EXISTS(SELECT 1 FROM coop_members m JOIN users u ON u.id=m.user_id WHERE m.coop_id=coop_gardens.id AND m.user_id=coop_gardens.owner_id AND m.left_at IS NULL AND u.account_status='active');
END;
--> statement-breakpoint
CREATE TRIGGER coop_water_guard BEFORE INSERT ON coop_waters
BEGIN
  SELECT RAISE(ABORT,'MELON_ACCOUNT_RESTRICTED') WHERE NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND account_status='active');
  SELECT RAISE(ABORT,'COOP_NOT_MEMBER') WHERE NOT EXISTS(SELECT 1 FROM coop_members WHERE coop_id=NEW.coop_id AND user_id=NEW.user_id AND left_at IS NULL);
  SELECT RAISE(ABORT,'COOP_MATURED') WHERE EXISTS(SELECT 1 FROM coop_gardens c JOIN coop_rounds r ON r.coop_id=c.id AND r.number=c.current_round WHERE c.id=NEW.coop_id AND r.matured_day>=NEW.day);
  SELECT RAISE(ABORT,'COOP_ROUND_CONFLICT') WHERE NOT EXISTS(
    SELECT 1 FROM coop_gardens c JOIN coop_rounds r ON r.coop_id=c.id AND r.number=c.current_round
    WHERE c.id=NEW.coop_id AND NEW.round_number=c.current_round+ CASE WHEN r.matured_day<NEW.day THEN 1 ELSE 0 END
  );
  INSERT INTO coop_rounds(coop_id,number,growth,started_at)
    SELECT c.id,NEW.round_number,0,NEW.created_at FROM coop_gardens c WHERE c.id=NEW.coop_id AND c.current_round<>NEW.round_number;
  UPDATE coop_gardens SET current_round=NEW.round_number WHERE id=NEW.coop_id AND current_round<>NEW.round_number;
END;
--> statement-breakpoint
CREATE TRIGGER coop_water_growth AFTER INSERT ON coop_waters
BEGIN
  UPDATE coop_rounds SET growth=growth+1,
    matured_day= CASE WHEN growth=34 THEN NEW.day ELSE matured_day END ,
    matured_at= CASE WHEN growth=34 THEN NEW.created_at ELSE matured_at END
    WHERE coop_id=NEW.coop_id AND number=NEW.round_number;
  UPDATE coop_gardens SET updated_at=NEW.created_at,last_watered_at=NEW.created_at WHERE id=NEW.coop_id;
  INSERT INTO coop_memories(coop_id,round_number,user_id,day,awarded_at)
    SELECT DISTINCT w.coop_id,w.round_number,w.user_id,NEW.day,NEW.created_at
    FROM coop_waters w JOIN coop_rounds r ON r.coop_id=w.coop_id AND r.number=w.round_number
    WHERE w.coop_id=NEW.coop_id AND w.round_number=NEW.round_number AND r.growth=35
    ON CONFLICT(coop_id,round_number,user_id) DO NOTHING;
END;
