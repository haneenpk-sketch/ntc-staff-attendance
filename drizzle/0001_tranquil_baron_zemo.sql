ALTER TABLE `staff` ADD `mobile` text;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_mobile_unique` ON `staff` (`mobile`);