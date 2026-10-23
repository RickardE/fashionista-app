CREATE TABLE "seen_outfit_anchors" (
	"style_profile_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seen_outfit_anchors_style_profile_id_product_id_pk" PRIMARY KEY("style_profile_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "seen_outfit_anchors" ADD CONSTRAINT "seen_outfit_anchors_style_profile_id_style_profiles_id_fk" FOREIGN KEY ("style_profile_id") REFERENCES "public"."style_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_outfit_anchors" ADD CONSTRAINT "seen_outfit_anchors_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seen_outfit_anchors" ADD CONSTRAINT "seen_outfit_anchors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seen_outfit_anchors_user_idx" ON "seen_outfit_anchors" USING btree ("user_id");