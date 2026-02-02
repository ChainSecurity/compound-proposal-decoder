import { NextResponse } from "next/server";
import { readFile, writeFile, copyFile, access } from "node:fs/promises";
import { join } from "node:path";
import type {
  AppConfig,
  ConfigResponse,
  ConfigErrorResponse,
  ConfigSaveResponse,
} from "@/types/config";
import { validateConfig } from "@/lib/config-validation";

// process.cwd() is the portal directory (apps/portal), go up 2 levels to monorepo root
const MONOREPO_ROOT = join(process.cwd(), "..", "..");

const CONFIG_PATH = join(MONOREPO_ROOT, "compound-config.json");
const EXAMPLE_PATH = join(MONOREPO_ROOT, "compound-config.json.example");

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function bootstrapConfig(): Promise<boolean> {
  const configExists = await fileExists(CONFIG_PATH);
  if (!configExists) {
    const exampleExists = await fileExists(EXAMPLE_PATH);
    if (exampleExists) {
      await copyFile(EXAMPLE_PATH, CONFIG_PATH);
      return true;
    }
    throw new Error(
      "No config file found and no example file available for bootstrapping"
    );
  }
  return false;
}

export async function GET(): Promise<
  NextResponse<ConfigResponse | ConfigErrorResponse>
> {
  try {
    const bootstrapped = await bootstrapConfig();

    const content = await readFile(CONFIG_PATH, "utf-8");
    const config: AppConfig = JSON.parse(content);

    const warnings = validateConfig(config);

    return NextResponse.json({
      success: true,
      config,
      bootstrapped,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load config";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request
): Promise<NextResponse<ConfigSaveResponse | ConfigErrorResponse>> {
  try {
    const body = await request.json();
    const config: AppConfig = body.config;

    if (!config) {
      return NextResponse.json(
        { success: false, error: "No config provided" },
        { status: 400 }
      );
    }

    // Validate structure
    if (typeof config.etherscanApiKey !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid config: etherscanApiKey must be a string" },
        { status: 400 }
      );
    }

    if (!config.chains || typeof config.chains !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid config: chains must be an object" },
        { status: 400 }
      );
    }

    if (!config.defaults || typeof config.defaults !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid config: defaults must be an object" },
        { status: 400 }
      );
    }

    // Write to file
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

    // Return warnings for the saved config
    const warnings = validateConfig(config);

    return NextResponse.json({
      success: true,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save config";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
