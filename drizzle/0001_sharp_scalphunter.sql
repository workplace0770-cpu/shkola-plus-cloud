CREATE TABLE `school_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_school_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`username` text,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`class_name` text,
	`created_at` text NOT NULL,
	`password_hash` text,
	`password_salt` text,
	`must_change_password` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_school_users`("id", "email", "username", "full_name", "role", "class_name", "created_at", "password_hash", "password_salt", "must_change_password") SELECT "id", "email", "username", "full_name", "role", "class_name", "created_at", "password_hash", "password_salt", "must_change_password" FROM `school_users`;--> statement-breakpoint
DROP TABLE `school_users`;--> statement-breakpoint
ALTER TABLE `__new_school_users` RENAME TO `school_users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `school_users_email_unique` ON `school_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `school_users_username_unique` ON `school_users` (`username`);