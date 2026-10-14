CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_org` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalogue_refreshes` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_org_name` ON `departments` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`department_id` text,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`run_after` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_by` text,
	`locked_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_claim` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`department_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `model_pricing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`input_per_mtok` text NOT NULL,
	`output_per_mtok` text NOT NULL,
	`cache_read_per_mtok` text,
	`cache_write_per_mtok` text,
	`source` text NOT NULL,
	`source_ref` text,
	`content_hash` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pricing_model` ON `model_pricing_snapshots` (`model_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `model_reference_data` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	`source_version` text,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reference_model_metric` ON `model_reference_data` (`model_id`,`metric`,`captured_at`);--> statement-breakpoint
CREATE TABLE `model_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`inference_provider` text NOT NULL,
	`provider_model_id` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_routes_model_provider` ON `model_routes` (`model_id`,`inference_provider`);--> statement-breakpoint
CREATE TABLE `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`upstream_id` text,
	`config` text NOT NULL,
	`config_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_versions_hash` ON `model_versions` (`model_id`,`config_hash`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`variant` text,
	`weights` text NOT NULL,
	`context_length` integer,
	`max_output_tokens` integer,
	`input_modalities` text DEFAULT '["text"]' NOT NULL,
	`reasoning_effort` text,
	`status` text NOT NULL,
	`status_reason` text,
	`current_version_id` text,
	`current_pricing_snapshot_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`billing_mode` text DEFAULT 'passthrough' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_model_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`mime_type` text NOT NULL,
	`content` text,
	`storage_key` text,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_model_id`) REFERENCES `run_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_artifacts_run_model` ON `run_artifacts` (`run_model_id`);--> statement-breakpoint
CREATE TABLE `run_models` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`position` integer NOT NULL,
	`model_id` text NOT NULL,
	`model_version_id` text NOT NULL,
	`model_name` text NOT NULL,
	`model_variant` text,
	`provider_name` text NOT NULL,
	`provider_color` text NOT NULL,
	`inference_provider` text NOT NULL,
	`provider_model_id` text NOT NULL,
	`request_params` text NOT NULL,
	`status` text NOT NULL,
	`queued_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`time_to_first_token_ms` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`output_tokens` integer,
	`reasoning_tokens` integer,
	`cost_nano_usd` integer,
	`cost_source` text,
	`calculated_cost_nano_usd` integer,
	`provider_cost_nano_usd` integer,
	`cost_breakdown` text,
	`pricing_snapshot_id` text,
	`currency` text,
	`cost_calculated_at` integer,
	`payload_hash` text,
	`provider_request_id` text,
	`served_by` text,
	`finish_reason` text,
	`error_code` text,
	`error_message` text,
	`provider_meta` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pricing_snapshot_id`) REFERENCES `model_pricing_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_models_run` ON `run_models` (`run_id`);--> statement-breakpoint
CREATE INDEX `run_models_org_model` ON `run_models` (`organization_id`,`model_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`task_version_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`payload_hash` text NOT NULL,
	`label` text,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`cancel_requested_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_version_id`) REFERENCES `task_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_org_created` ON `runs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `runs_task` ON `runs` (`task_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`active_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `task_files` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_version_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`kind` text NOT NULL,
	`extracted_text` text,
	`extraction_method` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_version_id`) REFERENCES `task_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_files_version` ON `task_files` (`task_version_id`);--> statement-breakpoint
CREATE TABLE `task_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_id` text NOT NULL,
	`version` integer NOT NULL,
	`instructions` text NOT NULL,
	`input_text` text DEFAULT '' NOT NULL,
	`max_output_tokens` integer NOT NULL,
	`content_hash` text NOT NULL,
	`change_note` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_versions_task_version` ON `task_versions` (`task_id`,`version`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text,
	`workflow_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`current_version_id` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_org` ON `tasks` (`organization_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `usage_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_model_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_nano_usd` integer NOT NULL,
	`currency` text NOT NULL,
	`billing_mode` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_model_id`) REFERENCES `run_models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_ledger_run_model_id_unique` ON `usage_ledger` (`run_model_id`);--> statement-breakpoint
CREATE INDEX `usage_ledger_org` ON `usage_ledger` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflows_org` ON `workflows` (`organization_id`);