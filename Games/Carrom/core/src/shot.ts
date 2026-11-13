import { simulatePhysics } from "./physics";
import { resolveShot } from "./rules";
import type {
  CarromShotInput,
  CarromShotResult,
  CarromSimulationOptions,
  CarromState,
} from "./types";

export function simulateShot(
  state: CarromState,
  shot: CarromShotInput,
  options: CarromSimulationOptions = {},
): CarromShotResult {
  const physics = simulatePhysics(state, shot, options);
  return resolveShot(state, physics, shot);
}
