import { AshbyApplicationProvider } from "./providers/ashby-provider";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import { EmailApplicationProvider } from "./providers/email-provider";
import { EmployerIntegrationApplicationProvider } from "./providers/employer-integration-provider";
import { GreenhouseApplicationProvider } from "./providers/greenhouse-provider";
import { InternalApplicationProvider } from "./providers/internal-provider";
import { LeverApplicationProvider } from "./providers/lever-provider";
import { SmartRecruitersApplicationProvider } from "./providers/smartrecruiters-provider";
import { WorkableApplicationProvider } from "./providers/workable-provider";
import type { ApplicationProvider } from "./types";

const providers: ApplicationProvider[] = [
  new GreenhouseApplicationProvider(),
  new LeverApplicationProvider(),
  new WorkableApplicationProvider(),
  new SmartRecruitersApplicationProvider(),
  new AshbyApplicationProvider(),
  new EmployerIntegrationApplicationProvider(),
  new InternalApplicationProvider(),
  new EmailApplicationProvider(),
  new BrowserAutomationApplicationProvider(),
];

export function getApplicationProvider(key: string): ApplicationProvider | null {
  return providers.find((p) => p.key === key) ?? null;
}

export function getAllApplicationProviders(): ApplicationProvider[] {
  return providers;
}

export {
  GreenhouseApplicationProvider,
  LeverApplicationProvider,
  WorkableApplicationProvider,
  SmartRecruitersApplicationProvider,
  AshbyApplicationProvider,
  EmployerIntegrationApplicationProvider,
  InternalApplicationProvider,
  EmailApplicationProvider,
  BrowserAutomationApplicationProvider,
};
