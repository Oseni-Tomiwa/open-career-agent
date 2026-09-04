CREATE TABLE "auth_action_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "state_hash" text NOT NULL,
  "nonce_hash" text NOT NULL,
  "redirect_path" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "provider_subject" text NOT NULL,
  "provider_email" text,
  "provider_email_verified" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at";--> statement-breakpoint
CREATE UNIQUE INDEX "pg_auth_action_tokens_hash_unique" ON "auth_action_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX "pg_auth_action_tokens_user_purpose_idx" ON "auth_action_tokens" ("user_id", "purpose", "created_at");--> statement-breakpoint
CREATE INDEX "pg_auth_action_tokens_expiry_idx" ON "auth_action_tokens" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pg_oauth_attempts_state_hash_unique" ON "oauth_attempts" ("state_hash");--> statement-breakpoint
CREATE INDEX "pg_oauth_attempts_expiry_idx" ON "oauth_attempts" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pg_user_identities_provider_subject_unique" ON "user_identities" ("provider", "provider_subject");--> statement-breakpoint
CREATE INDEX "pg_user_identities_user_idx" ON "user_identities" ("user_id");
