/**
 * Core types for the simulator
 *
 * These types are used by both CLI (main.ts) and library (simulator.ts) entry points.
 */

import type { Backend } from "../backends";

/**
 * Logger interface for simulation output
 *
 * CLI uses the real logger from logger.ts, library uses nullLogger for silent operation.
 */
export interface Logger {
    section(title: string): void;
    step(msg: string): void;
    done(msg: string): void;
    info(label: string, value: string | number | bigint): void;
    tx(label: string, hash: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}

/**
 * Silent logger for library use (suppresses all output)
 */
export const nullLogger: Logger = {
    section: () => {},
    step: () => {},
    done: () => {},
    info: () => {},
    tx: () => {},
    warn: () => {},
    error: () => {},
};

/**
 * Context passed to all simulation functions
 *
 * Contains the backend and logger, allowing shared code to work
 * with either CLI or library entry points.
 */
export interface SimulationContext {
    backend: Backend;
    logger: Logger;
}

/**
 * Result from governance simulation, including the actual proposal ID used
 * (may differ from input if proposal was re-submitted for voting power)
 */
export interface GovernanceSimulationResult {
    result: import("../types").ChainExecutionResult;
    actualProposalId: string;
}
