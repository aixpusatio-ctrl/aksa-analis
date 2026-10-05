CREATE TABLE `results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`page_number` integer DEFAULT 1 NOT NULL,
	`page_url` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `results_run_id_idx` ON `results` (`run_id`);--> statement-breakpoint
CREATE TABLE `run_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_logs_run_id_idx` ON `run_logs` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scraper_id` text,
	`scraper_name` text NOT NULL,
	`url` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`total_items` integer DEFAULT 0 NOT NULL,
	`pages_processed` integer DEFAULT 0 NOT NULL,
	`pages_planned` integer,
	`error_message` text,
	`config` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`scraper_id`) REFERENCES `scrapers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `runs_created_at_idx` ON `runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `runs_scraper_id_idx` ON `runs` (`scraper_id`);--> statement-breakpoint
CREATE TABLE `scrapers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`item_selector` text DEFAULT '' NOT NULL,
	`item_selector_kind` text DEFAULT 'css' NOT NULL,
	`fields` text NOT NULL,
	`pagination` text NOT NULL,
	`request_delay_ms` integer DEFAULT 1000 NOT NULL,
	`timeout_ms` integer DEFAULT 30000 NOT NULL,
	`max_pages` integer DEFAULT 5 NOT NULL,
	`concurrency` integer DEFAULT 1 NOT NULL,
	`max_retries` integer DEFAULT 2 NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`wait_until` text DEFAULT 'domcontentloaded' NOT NULL,
	`wait_for_selector` text DEFAULT '' NOT NULL,
	`wait_for_timeout_ms` integer DEFAULT 0 NOT NULL,
	`respect_robots_txt` integer DEFAULT true NOT NULL,
	`block_resources` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
