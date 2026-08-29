import crypto from "crypto";
import type { Job, IntegrationStatus } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Sandbox provider used exclusively for jobs ingested from the "demo"
 * source (spec §48). These employers are fabricated sample data, so there
 * is no real inbox to deliver to — this provider simulates the submission
 * pipeline honestly labelled DEMO everywhere in the UI, and never runs
 * against a job sourced from a real integration.
 */
export class InternalApplicationProvider extends BaseApplicationProvider {
  readonly key = "internal";
  readonly name = "Internal demo sandbox";

  getStatus(): IntegrationStatus {
    return "DEMO";
  }

  protected isConfigured(): boolean {
    return true;
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    if (job.source !== "demo") {
      return {
        success: false,
        manualRequired: true,
        errorMessage: "Internal demo provider refused to submit a non-demo job.",
      };
    }
    if (!candidate.resumeText.trim()) {
      return { success: false, manualRequired: true, errorMessage: "No resume text available to submit." };
    }

    // Simulate realistic submission latency for the UI's staged progress states.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const reference = `DEMO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    return {
      success: true,
      externalApplicationId: reference,
      confirmationDetails: { note: "Simulated submission to demo sandbox — no real employer received this application.", reference },
    };
  }

  async verifySubmission(externalApplicationId: string): Promise<boolean> {
    return externalApplicationId.startsWith("DEMO-");
  }

  async getApplicationStatus(): Promise<string> {
    return "submitted";
  }
}
