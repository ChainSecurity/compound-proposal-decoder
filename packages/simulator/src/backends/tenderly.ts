/**
 * Tenderly Backend Implementation
 *
 * Uses Tenderly virtual testnet RPC methods for simulation:
 * - tenderly_setStorageAt
 * - tenderly_mineBlock
 * - tenderly_simulateBundle
 */

import { ethers } from "ethers";
import type {
    Backend,
    BackendType,
    TransactionParams,
    BundleTransactionResult,
    MineBlockOptions,
    BackendInitOptions,
} from "./types";
import { loadConfig, getSimulatorRpcUrl } from "../config";

export class TenderlyBackend implements Backend {
    readonly name: BackendType = "tenderly";

    private providers: Map<string, ethers.JsonRpcProvider> = new Map();
    private impersonatedAccounts: Map<string, Set<string>> = new Map();

    async initialize(chains: string[], _options?: BackendInitOptions): Promise<void> {
        const config = loadConfig();

        for (const chain of chains) {
            const rpcUrl = getSimulatorRpcUrl(chain);
            if (!rpcUrl) {
                throw new Error(`No simulatorRpcUrl configured for chain: ${chain}`);
            }

            const provider = new ethers.JsonRpcProvider(rpcUrl);
            this.providers.set(chain, provider);
            this.impersonatedAccounts.set(chain, new Set());
        }
    }

    async cleanup(): Promise<void> {
        // Tenderly is stateless from our perspective - no cleanup needed
        this.providers.clear();
        this.impersonatedAccounts.clear();
    }

    getProvider(chain: string): ethers.JsonRpcProvider {
        const provider = this.providers.get(chain);
        if (!provider) {
            throw new Error(`Chain not initialized: ${chain}`);
        }
        return provider;
    }

    async setStorageAt(chain: string, address: string, slot: string, value: string): Promise<void> {
        const provider = this.getProvider(chain);
        await provider.send("tenderly_setStorageAt", [address, slot, value]);
    }

    async mineBlock(chain: string, options?: MineBlockOptions): Promise<void> {
        const provider = this.getProvider(chain);

        const params: Record<string, string | null> = {
            time: options?.timestamp ? "0x" + options.timestamp.toString(16) : null,
            number: options?.blockNumber ? "0x" + options.blockNumber.toString(16) : null,
            difficulty: null,
            gasLimit: null,
            coinbase: null,
            random: null,
            baseFee: null,
        };

        await provider.send("tenderly_mineBlock", [params]);
    }

    async advanceTime(chain: string, seconds: number): Promise<void> {
        const provider = this.getProvider(chain);
        const currentBlock = await provider.getBlock("latest");
        if (!currentBlock) {
            throw new Error("Failed to get current block");
        }
        const newTimestamp = currentBlock.timestamp + seconds;
        await this.mineBlock(chain, { timestamp: newTimestamp });
    }

    async impersonateAccount(chain: string, address: string): Promise<void> {
        // Tenderly allows any address as 'from' - no explicit impersonation needed
        // Track it anyway for consistency
        const accounts = this.impersonatedAccounts.get(chain);
        if (accounts) {
            accounts.add(address.toLowerCase());
        }
    }

    async stopImpersonating(chain: string, address: string): Promise<void> {
        // Tenderly doesn't require explicit stop - just remove from tracking
        const accounts = this.impersonatedAccounts.get(chain);
        if (accounts) {
            accounts.delete(address.toLowerCase());
        }
    }

    async simulateBundle(chain: string, transactions: TransactionParams[]): Promise<BundleTransactionResult[]> {
        const provider = this.getProvider(chain);

        const params = transactions.map(tx => ({
            from: tx.from,
            to: tx.to,
            gas: tx.gas,
            gasPrice: tx.gasPrice,
            value: tx.value ?? "0x0",
            data: tx.data,
        }));

        const results = await provider.send("tenderly_simulateBundle", [params, "latest"]);

        return results.map((result: { status: boolean | number; gasUsed?: string | number; txHash?: string; revertReason?: string }) => ({
            success: result.status === true || result.status === 1,
            gasUsed: result.gasUsed ? BigInt(result.gasUsed) : undefined,
            txHash: result.txHash,
            revertReason: result.revertReason,
        }));
    }

    async snapshot(chain: string): Promise<string> {
        const provider = this.getProvider(chain);
        return await provider.send("evm_snapshot", []);
    }

    async revert(chain: string, snapshotId: string): Promise<boolean> {
        const provider = this.getProvider(chain);
        return await provider.send("evm_revert", [snapshotId]);
    }

    supportsPersistentSnapshots(): boolean {
        return true;
    }

    async sendTransaction(chain: string, tx: TransactionParams): Promise<string> {
        const provider = this.getProvider(chain);
        return await provider.send("eth_sendTransaction", [{
            from: tx.from,
            to: tx.to,
            gas: tx.gas,
            gasPrice: tx.gasPrice,
            value: tx.value ?? "0x0",
            data: tx.data,
        }]);
    }
}
