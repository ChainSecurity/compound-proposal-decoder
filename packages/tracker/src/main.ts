#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parseProposalArgs } from "./parse-args.js";
import { trackProposal, trackProposals } from "./tracker.js";
import { prettyPrint, prettyPrintBatch } from "./printer.js";

const argv = await yargs(hideBin(process.argv))
  .usage("Usage: $0 <proposals..> [--json]")
  .command("$0 <proposals..>", "Track cross-chain execution of governance proposals", (yargs) =>
    yargs.positional("proposals", {
      describe: "Proposal IDs or ranges (e.g., 528 or 525-530)",
      type: "string",
      array: true,
      demandOption: true,
    }),
  )
  .option("json", {
    describe: "Output raw JSON",
    type: "boolean",
    default: false,
  })
  .strict()
  .help()
  .parse();

const rawArgs = argv.proposals as string[];
const jsonOutput = argv.json as boolean;

try {
  const proposalIds = parseProposalArgs(rawArgs);

  if (proposalIds.length === 1) {
    // Single proposal — existing behavior
    const result = await trackProposal(proposalIds[0]!);
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      prettyPrint(result);
    }
  } else {
    // Multiple proposals — batch
    const batch = await trackProposals(proposalIds);
    if (jsonOutput) {
      console.log(JSON.stringify(batch, null, 2));
    } else {
      prettyPrintBatch(batch);
    }
  }
} catch (err) {
  if (jsonOutput) {
    console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  } else {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
}
