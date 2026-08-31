CREATE TABLE "opportunity_identity_keys" (
	"identity_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "opportunity_identity_keys_opportunity_id_opportunities_id_fk"
		FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id")
		ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "pg_opportunity_identity_keys_opportunity_idx"
	ON "opportunity_identity_keys" USING btree ("opportunity_id");
