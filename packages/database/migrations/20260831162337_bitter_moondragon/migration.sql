CREATE TABLE `opportunity_identity_keys` (
	`identity_key` text PRIMARY KEY,
	`kind` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_opportunity_identity_keys_opportunity_id_opportunities_id_fk` FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX `opportunity_identity_keys_opportunity_idx` ON `opportunity_identity_keys` (`opportunity_id`);