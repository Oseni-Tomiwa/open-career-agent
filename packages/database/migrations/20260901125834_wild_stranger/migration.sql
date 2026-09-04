CREATE TABLE `auth_action_tokens` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_auth_action_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `oauth_attempts` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`state_hash` text NOT NULL,
	`nonce_hash` text NOT NULL,
	`redirect_path` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_identities` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`provider_email` text,
	`provider_email_verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_user_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = `created_at`;--> statement-breakpoint
CREATE UNIQUE INDEX `auth_action_tokens_hash_unique` ON `auth_action_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_action_tokens_user_purpose_idx` ON `auth_action_tokens` (`user_id`,`purpose`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_action_tokens_expiry_idx` ON `auth_action_tokens` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_attempts_state_hash_unique` ON `oauth_attempts` (`state_hash`);--> statement-breakpoint
CREATE INDEX `oauth_attempts_expiry_idx` ON `oauth_attempts` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_identities_provider_subject_unique` ON `user_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `user_identities_user_idx` ON `user_identities` (`user_id`);
