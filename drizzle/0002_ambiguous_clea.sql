CREATE TABLE `grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`student_id` integer NOT NULL,
	`assignment_id` integer NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `school_classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_classes_name_unique` ON `school_classes` (`name`);--> statement-breakpoint
CREATE TABLE `school_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `school_subjects_name_unique` ON `school_subjects` (`name`);--> statement-breakpoint
CREATE TABLE `teaching_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`teacher_id` integer NOT NULL,
	`class_id` integer NOT NULL,
	`subject_id` integer NOT NULL
);
