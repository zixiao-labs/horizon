import type { RunId } from "../../shared/thread";
import type { AgentDriver, AgentDriverFactory, AgentDriverIdentity } from "./types";

export interface AgentLaunch {
  readonly driver: AgentDriver;
  readonly completion: Promise<void>;
}

/**
 * Composes AgentDrivers only. Collaboration and thread synchronization are
 * deliberately outside this class.
 */
export class AgentOrchestrator {
  readonly #factory: AgentDriverFactory;
  readonly #drivers = new Map<RunId, AgentDriver>();

  constructor(factory: AgentDriverFactory) {
    this.#factory = factory;
  }

  launch(identity: AgentDriverIdentity, prompt: string): AgentLaunch {
    if (this.#drivers.has(identity.runId)) {
      throw new Error(`Agent run ${identity.runId} already exists`);
    }
    const driver = this.#factory.create(identity);
    this.#drivers.set(identity.runId, driver);
    return {
      driver,
      completion: driver.prompt(prompt),
    };
  }

  fork(
    parentRunId: RunId,
    identity: Omit<AgentDriverIdentity, "parentRunId">,
    prompt: string,
  ): AgentLaunch {
    if (!this.#drivers.has(parentRunId)) {
      throw new Error(`Parent agent run ${parentRunId} does not exist`);
    }
    return this.launch({ ...identity, parentRunId }, prompt);
  }

  steer(runId: RunId, prompt: string): void {
    this.#driver(runId).steer(prompt);
  }

  followUp(runId: RunId, prompt: string): void {
    this.#driver(runId).followUp(prompt);
  }

  async abort(runId: RunId): Promise<void> {
    await this.#driver(runId).abort();
  }

  async dispose(runId: RunId): Promise<void> {
    const driver = this.#driver(runId);
    this.#drivers.delete(runId);
    await driver.dispose();
  }

  async disposeAll(): Promise<void> {
    const drivers = [...this.#drivers.values()];
    this.#drivers.clear();
    await Promise.all(drivers.map((driver) => driver.dispose()));
  }

  #driver(runId: RunId): AgentDriver {
    const driver = this.#drivers.get(runId);
    if (!driver) {
      throw new Error(`Agent run ${runId} does not exist`);
    }
    return driver;
  }
}
