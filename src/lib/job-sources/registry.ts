import { AshbyAdapter } from "./adapters/ashby-adapter";
import { CustomEmployerAdapter, type CustomEmployerConfig } from "./adapters/custom-employer-adapter";
import { EmployerFeedAdapter, type EmployerFeedConfig } from "./adapters/employer-feed-adapter";
import { EuresAdapter } from "./adapters/eures-adapter";
import { GreenhouseAdapter } from "./adapters/greenhouse-adapter";
import { JobsPlusAdapter } from "./adapters/jobsplus-adapter";
import { LeverAdapter } from "./adapters/lever-adapter";
import { LicensedApiAdapter, type LicensedApiConfig } from "./adapters/licensed-api-adapter";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters-adapter";
import { WorkableAdapter } from "./adapters/workable-adapter";
import { DemoJobSourceAdapter } from "./adapters/demo-adapter";
import type { JobSourceAdapter } from "./types";

export interface JobSourceRegistryConfig {
  employerFeed?: EmployerFeedConfig;
  licensedApi?: LicensedApiConfig;
  customEmployer?: CustomEmployerConfig;
}

/**
 * Builds every job-source adapter the platform knows about. Per-employer
 * config (feed URLs, board tokens stored per row) comes from the
 * `job_sources.config` column and is passed in by the caller (the
 * ingestion worker) rather than hardcoded here, so new sources can be
 * onboarded without a code change.
 */
export function getAllJobSourceAdapters(config: JobSourceRegistryConfig = {}): JobSourceAdapter[] {
  return [
    new JobsPlusAdapter(),
    new EuresAdapter(),
    new EmployerFeedAdapter(config.employerFeed ?? null),
    new LicensedApiAdapter(config.licensedApi ?? null),
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new WorkableAdapter(),
    new SmartRecruitersAdapter(),
    new AshbyAdapter(),
    new CustomEmployerAdapter(config.customEmployer ?? null),
    new DemoJobSourceAdapter(),
  ];
}

export {
  JobsPlusAdapter,
  EuresAdapter,
  EmployerFeedAdapter,
  LicensedApiAdapter,
  GreenhouseAdapter,
  LeverAdapter,
  WorkableAdapter,
  SmartRecruitersAdapter,
  AshbyAdapter,
  CustomEmployerAdapter,
  DemoJobSourceAdapter,
};
