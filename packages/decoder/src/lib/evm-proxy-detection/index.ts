import { logger } from "@/logger";
import { type BlockTag, type EIP1193ProviderRequestFunc, type Result, type DetectionScheme } from "@/lib/evm-proxy-detection/types";
import { scheme as eip1167ProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip1167-proxy";
import { scheme as eip1967DirectProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip1967-direct-proxy";
import { scheme as eip1967BeaconProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip1967-beacon-proxy";
import { scheme as openZeppelinProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-openzeppelin-proxy";
import { scheme as eip1822ProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip1822-uups-proxy";
import { scheme as eip897DelegateProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip897-delegate-proxy";
import { scheme as safeProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-safe-proxy";
import { scheme as comptrollerProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-comptroller-proxy";
import { scheme as balancerBatchRelayerProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-balancer-batch-relayer-proxy";
import { scheme as eip2535DiamondProxyScheme } from "@/lib/evm-proxy-detection/schemes/detect-eip2535-diamond-proxy";

const detections: DetectionScheme[] = [
  eip1167ProxyScheme,
  eip1967DirectProxyScheme,
  eip1967BeaconProxyScheme,
  openZeppelinProxyScheme,
  eip1822ProxyScheme,
  eip897DelegateProxyScheme,
  safeProxyScheme,
  comptrollerProxyScheme,
  balancerBatchRelayerProxyScheme,
  eip2535DiamondProxyScheme,
];

const detectProxy = async (
  proxyAddress: `0x${string}`,
  jsonRpcRequest: EIP1193ProviderRequestFunc,
  blockTag: BlockTag = "latest"
): Promise<Result | null> => {
  const finished = new Array(detections.length).fill(false);
  const promises = detections.map(({ name, detect }, i) => {
    logger.trace({ proxy: name }, "detection start");
    return detect(proxyAddress, jsonRpcRequest, blockTag)
      .then((result) => {
        if (result === null) {
          logger.trace({ proxy: name }, "detection unsuccessful");
          throw new Error(`${name} not found`);
        }
        logger.trace({ proxy: name, result }, "detection end");
        return result;
      })
      .catch((err) => {
        if (err.message !== `${name} not found`) {
          logger.trace({ proxy: name, err }, "detection error");
        }
        throw err;
      })
      .finally(() => {
        finished[i] = true;
      });
  });

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => {
      detections.forEach(({ name }, i) => {
        if (!finished[i]) {
          logger.error({ proxy: name }, "detection timed out");
        }
      });
      resolve(null);
    }, 10000)
  );

  try {
    return await Promise.race([Promise.any(promises), timeout]);
  } catch {
    return null;
  }
};

export default detectProxy;
