# Compound Proposal Decoder

This is a CLI tool to decode Compound governance proposals. It was developed by ChainSecurity as part of the Security Service Provider engagement with Compound to streamline proposal support. The decoder fetches proposal data from the blockchain, retrieves ABIs and contract names from Etherscan, and then decodes the proposal's actions into a human-readable format.

## Features

- Fetches proposal details directly from the Compound Governor contract.
- Retrieves contract ABIs and names from Etherscan.
- Caches ABIs and contract names locally to speed up subsequent runs.
- Decodes proposal actions, including function calls and parameters.
- Specialized handlers for decoding transactions through bridges (e.g., Linea).
- Colorized terminal output for readability.
- Adjustable logging levels.

## Usage (Docker)

This is the recommended way to run the proposal decoder, as it requires no local setup other than Docker.

1.  **Build the Docker image:**

    ```bash
    docker build -t proposal-decoder .
    ```

2.  **Run the decoder in a container:**
    Create a `.env` file (you can copy `.env.example`) with your Etherscan API key and RPC URLs. Then, run the container, passing the proposal ID as an argument.

    ```bash
    docker run --env-file .env -v "$(pwd)/.cache:/usr/src/app/.cache" -it proposal-decoder <proposalIdNumber>
    ```

    For example:

    ```bash
    docker run --env-file .env -v "$(pwd)/.cache:/usr/src/app/.cache" -it proposal-decoder 474
    ```

    Using the `-v "$(pwd)/.cache:/usr/src/app/.cache"` flag is recommended. It maps the container's cache directory to your local filesystem, which speeds up subsequent runs by reusing already downloaded data.

    The `-it` flags are important to preserve color and formatting in the output.

    **Logging:**
    You can control the log level using the `--log-level` (or `-l`) flag. This is useful for debugging.

    ```bash
    docker run --env-file .env -it proposal-decoder 221 --log-level debug
    ```

## Usage (Local Development)

### Prerequisites

- Node.js (v20 or higher)
- pnpm
- An Etherscan API key
- RPC URLs for Ethereum mainnet and Linea

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Arr00/proposal-decoder.git
    cd proposal-decoder
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file by copying the example:
    ```bash
    cp .env.example .env
    ```
    Then, edit the `.env` file with your Etherscan API key and RPC URLs:
    ```
    ETHERSCAN_API_KEY=your_etherscan_api_key
    ETH_RPC_URL=your_ethereum_rpc_url
    LINEA_RPC_URL=your_linea_rpc_url
    ```

### Running the Decoder

To decode a proposal, run the `decode` script with the proposal ID:

```bash
pnpm run decode <proposalIdNumber>
```

For example, to decode proposal 221:

```bash
pnpm run decode 221
```

You can also set the log level for more detailed output:

```bash
pnpm run decode 221 --log-level debug
```

### Proposal Input Options

The `<proposal>` argument accepts three different formats, allowing you to work with live proposals, saved JSON exports, or raw calldata captured from the governor:

- A numeric Compound proposal ID (as shown above).
- A proposal JSON object (inline or via file path).
- A raw calldata blob for `propose(address[],uint256[],bytes[],string)`.

#### Decoding from Proposal JSON

Pass either a file path or an inline JSON blob. The decoder looks for the `targets`, `values`, `calldatas`, and `descriptionHash` fields either at the top level or under a `details` object, and the arrays must all have the same length. Optional metadata (`governor`, `proposalId`, `chainId`) can be supplied either at the top level or under a `metadata` object to improve logging.

```bash
# Using a JSON file
pnpm run decode ./proposal-474.json

# Inline JSON (quote with single quotes so the shell leaves it untouched)
pnpm run decode '{ "details": { "targets": ["0x..."], "values": ["0"], "calldatas": ["0x..."], "descriptionHash": "0x..." }, "metadata": { "governor": "0x...", "proposalId": "474", "chainId": 1 } }'
```

Fields in `values` and `proposalId` can be numbers, numeric strings, or bigint literals. If you already have data that matches the Compound `GovernorAlpha/Bravo.propose` arguments, you can drop the `details` wrapper and provide those fields at the top level instead.

#### Decoding from Raw Calldata

You can feed the tool a calldata blob captured from a `propose` transaction (e.g. from Tenderly or an RPC trace). The blob must be valid hex (`0x`-prefixed, even length) encoding of the `propose(address[],uint256[],bytes[],string)` call. The decoder will extract the proposal details and continue as if they were provided via JSON.

```bash
pnpm run decode 0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c...
```

If the calldata cannot be parsed as the Compound `propose` function, the decoder exits with an explanatory error.

## Agentic Review

If you have [Claude Code](https://github.com/anthropics/claude-code) installed, you can run `/review-proposal <proposalId>` to agentically review a proposal. The review will be written to `reviews/proposal-<id>.md`.
