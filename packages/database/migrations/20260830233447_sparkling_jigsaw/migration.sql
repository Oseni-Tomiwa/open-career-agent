ALTER TABLE `applications` ADD `originating_decision_id` text REFERENCES decisions(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `applications` ADD `originating_decision_state` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `originating_decision_action` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `submitted_at` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `follow_up_due_at` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `follow_up_note` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `follow_up_completed_at` integer;--> statement-breakpoint
ALTER TABLE `applications` ADD `note` text;--> statement-breakpoint
CREATE INDEX `applications_candidate_status_idx` ON `applications` (`candidate_id`,`status`);