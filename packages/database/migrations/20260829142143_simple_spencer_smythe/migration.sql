CREATE TABLE `background_task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`detail` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `background_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `background_task_events_task_time_idx` ON `background_task_events` (`task_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `background_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_type` text NOT NULL,
	`payload` text NOT NULL,
	`state` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`idempotency_key` text,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "background_tasks_state_check" CHECK("background_tasks"."state" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "background_tasks_attempts_check" CHECK("background_tasks"."attempts" >= 0),
	CONSTRAINT "background_tasks_max_attempts_check" CHECK("background_tasks"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `background_tasks_idempotency_key_unique` ON `background_tasks` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `background_tasks_claimable_idx` ON `background_tasks` (`state`,`available_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `background_tasks_expired_lease_idx` ON `background_tasks` (`state`,`lease_expires_at`);