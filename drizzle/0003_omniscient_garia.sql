CREATE TABLE `schedule_lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`class_id` integer NOT NULL,
	`subject_id` integer NOT NULL,
	`teacher_id` integer NOT NULL,
	`room` text NOT NULL
);
