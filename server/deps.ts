/** Wires the real implementations. Tests and scripts build their own AgentDeps with fakes. */
import type { AgentDeps } from "./agents/common.js";
import type { AppConfig } from "./config.js";
import { findCityPack } from "./data/cities/index.js";
import { createNemotronClient } from "./llm/nemotron.js";
import { createToolSuite } from "./tools/index.js";

export function createDeps(cfg: AppConfig): AgentDeps {
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    llm: createNemotronClient(cfg),
    tools: createToolSuite(cfg, today),
    config: cfg,
    findCityPack: (d) => findCityPack(d),
    now: Date.now,
    today,
  };
}
