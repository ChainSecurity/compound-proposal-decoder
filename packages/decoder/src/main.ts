import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { prettyPrint } from "./outputs/printer.js";
import {
  decodeProposal,
  decodeProposalFromDetails,
  decodeProposalFromCalldata,
} from "./decoder.js";
import { logger } from "./logger.js";
import { parseProposalInput } from "./cli/proposal-input.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
type CliArgs = { proposal: string; logLevel: LogLevel };

async function main() {
  await yargs(hideBin(process.argv))
    .command<CliArgs>(
      "$0 <proposal>",
      "Decode a Compound governance proposal",
      (yargs) => {
        return yargs
          .positional("proposal", {
            describe: "Proposal to decode (numeric ID, JSON inline/file path, or raw calldata)",
            type: "string",
            demandOption: true,
          })
          .option("log-level", {
            alias: "l",
            describe: "The level of logging to display",
            type: "string",
            choices: ["trace", "debug", "info", "warn", "error", "fatal"],
            default: "warn",
          });
      },
      async (argv) => {
        logger.level = argv.logLevel;
        try {
          const input = await parseProposalInput(argv.proposal);
          const decoded =
            input.kind === "id"
              ? await decodeProposal(input.id)
              : input.kind === "details"
              ? await decodeProposalFromDetails(input.details, input.metadata)
              : await decodeProposalFromCalldata(input.calldata);

          prettyPrint(decoded);
        } catch (err: unknown) {
          logger.error(err, "An error occurred while decoding the proposal");
          process.exit(1);
        }
      }
    )
    .strict()
    .help()
    .alias("h", "help")
    .fail((msg, err, yargs) => {
      if (err) throw err; // preserve stack
      logger.error(`Error: ${msg}\n`);
      yargs.showHelp();
      process.exit(1);
    }).argv;
}

main().catch((error) => {
  logger.fatal(error, "An unexpected error occurred");
  process.exit(1);
});
