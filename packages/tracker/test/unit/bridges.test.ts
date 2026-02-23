import { describe, it, expect } from "vitest";
import { AbiCoder, Interface } from "ethers";
import { detectBridgeAction } from "@/bridges";

const coder = AbiCoder.defaultAbiCoder();

// Helper: encode inner payload (same format all bridges use)
function encodeInnerPayload(targets: string[], values: bigint[], signatures: string[], calldatas: string[]): string {
  return coder.encode(
    ["address[]", "uint256[]", "string[]", "bytes[]"],
    [targets, values, signatures, calldatas],
  );
}

const SAMPLE_TARGETS = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
];
const SAMPLE_VALUES = [0n, 0n];
const SAMPLE_SIGS = ["", ""];
const SAMPLE_CALLDATAS = ["0x", "0x"];
const INNER_PAYLOAD = encodeInnerPayload(SAMPLE_TARGETS, SAMPLE_VALUES, SAMPLE_SIGS, SAMPLE_CALLDATAS);

describe("detectBridgeAction", () => {
  it("returns null for non-bridge targets", () => {
    const result = detectBridgeAction(0, "0x0000000000000000000000000000000000000001", "0x");
    expect(result).toBeNull();
  });

  it("detects Arbitrum bridge (createRetryableTicket)", () => {
    const iface = new Interface([
      "function createRetryableTicket(address to, uint256 l2CallValue, uint256 maxSubmissionCost, address excessFeeRefundAddress, address callValueRefundAddress, uint256 gasLimit, uint256 maxFeePerGas, bytes calldata data) external payable returns (uint256)",
    ]);
    const calldata = iface.encodeFunctionData("createRetryableTicket", [
      "0x42480C37B249e33aABaf4c22B20235656bd38068", // to (receiver)
      0n,
      0n,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      1000000n,
      0n,
      INNER_PAYLOAD,
    ]);

    const result = detectBridgeAction(0, "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("arbitrum");
    expect(result!.chainName).toBe("arbitrum");
    expect(result!.innerTargets).toHaveLength(2);
    expect(result!.innerTargets[0]!.toLowerCase()).toBe(SAMPLE_TARGETS[0]!.toLowerCase());
  });

  it("detects OP-CDM bridge (Optimism sendMessage)", () => {
    const iface = new Interface([
      "function sendMessage(address _target, bytes memory _message, uint32 _minGasLimit) external",
    ]);
    const calldata = iface.encodeFunctionData("sendMessage", [
      "0xC3a73A70d1577CD5B02da0bA91C0Afc8fA434DAF",
      INNER_PAYLOAD,
      1000000,
    ]);

    const result = detectBridgeAction(1, "0x25ace71c97B33Cc4729CF772ae268934F7ab5fA1", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("op-cdm");
    expect(result!.chainName).toBe("optimism");
    expect(result!.innerTargets).toHaveLength(2);
  });

  it("detects Base bridge", () => {
    const iface = new Interface([
      "function sendMessage(address _target, bytes memory _message, uint32 _minGasLimit) external",
    ]);
    const calldata = iface.encodeFunctionData("sendMessage", [
      "0x18281dfC4d00905DA1aaA6731414EABa843c468A",
      INNER_PAYLOAD,
      1000000,
    ]);

    const result = detectBridgeAction(2, "0x866E82a600A1414e583f7F13623F1aC5d58b0Afa", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("op-cdm");
    expect(result!.chainName).toBe("base");
  });

  it("detects Scroll bridge", () => {
    const iface = new Interface([
      "function sendMessage(address _to, uint256 _value, bytes memory _message, uint256 _gasLimit) external payable",
    ]);
    const calldata = iface.encodeFunctionData("sendMessage", [
      "0x0000000000000000000000000000000000000001",
      0n,
      INNER_PAYLOAD,
      1000000n,
    ]);

    const result = detectBridgeAction(3, "0x6774Bcbd5ceCeF1336b5300fb5186a12DDD8b367", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("scroll");
    expect(result!.chainName).toBe("scroll");
  });

  it("detects Linea bridge", () => {
    const iface = new Interface([
      "function sendMessage(address _to, uint256 _fee, bytes calldata _calldata) external payable",
    ]);
    const calldata = iface.encodeFunctionData("sendMessage", [
      "0x0000000000000000000000000000000000000001",
      0n,
      INNER_PAYLOAD,
    ]);

    const result = detectBridgeAction(4, "0xd19d4B5d358258f05D7B411E21A1460D11B0876F", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("linea");
    expect(result!.chainName).toBe("linea");
  });

  it("detects Polygon bridge (sendMessageToChild)", () => {
    const iface = new Interface([
      "function sendMessageToChild(address _receiver, bytes calldata _data) external",
    ]);
    const calldata = iface.encodeFunctionData("sendMessageToChild", [
      "0x0000000000000000000000000000000000000001",
      INNER_PAYLOAD,
    ]);

    const result = detectBridgeAction(5, "0xfe5e5D361b2ad62c541bAb87C45a0B9B018389a2", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("polygon");
    expect(result!.chainName).toBe("polygon");
  });

  it("detects CCIP bridge", () => {
    const iface = new Interface([
      "function ccipSend(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) external payable returns (bytes32)",
    ]);
    const calldata = iface.encodeFunctionData("ccipSend", [
      "6916147374840168594", // Ronin selector
      {
        receiver: "0x0000000000000000000000002c7EfA766338D33B9192dB1fB5D170Bdc03ef3F9",
        data: INNER_PAYLOAD,
        tokenAmounts: [],
        feeToken: "0x0000000000000000000000000000000000000000",
        extraArgs: "0x",
      },
    ]);

    const result = detectBridgeAction(6, "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D", calldata);
    expect(result).not.toBeNull();
    expect(result!.bridgeType).toBe("ccip");
    expect(result!.chainName).toBe("ronin");
    expect(result!.innerTargets).toHaveLength(2);
  });

  it("is case-insensitive for bridge addresses", () => {
    const iface = new Interface([
      "function sendMessage(address _target, bytes memory _message, uint32 _minGasLimit) external",
    ]);
    const calldata = iface.encodeFunctionData("sendMessage", [
      "0xC3a73A70d1577CD5B02da0bA91C0Afc8fA434DAF",
      INNER_PAYLOAD,
      1000000,
    ]);

    // Use lowercase address
    const result = detectBridgeAction(0, "0x25ace71c97b33cc4729cf772ae268934f7ab5fa1", calldata);
    expect(result).not.toBeNull();
    expect(result!.chainName).toBe("optimism");
  });
});
