"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalSettings } from "./global-settings";
import { ChainList } from "./chain-list";
import { ConfigWarnings } from "./config-warnings";
import type { AppConfig, ConfigWarning } from "@/types/config";

interface ConfigFormProps {
  initialConfig: AppConfig;
  initialWarnings: ConfigWarning[];
  bootstrapped: boolean;
}

export function ConfigForm({
  initialConfig,
  initialWarnings,
  bootstrapped,
}: ConfigFormProps) {
  const [config, setConfig] = React.useState<AppConfig>(initialConfig);
  const [warnings, setWarnings] = React.useState<ConfigWarning[]>(initialWarnings);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  // Track changes
  React.useEffect(() => {
    const hasChanged =
      JSON.stringify(config) !== JSON.stringify(initialConfig);
    setHasChanges(hasChanged);
  }, [config, initialConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setWarnings(data.warnings);
      setHasChanges(false);
      setSaveStatus({
        type: "success",
        message: "Configuration saved successfully",
      });

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveStatus((current) =>
          current?.type === "success" ? null : current
        );
      }, 3000);
    } catch (error) {
      setSaveStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(initialConfig);
    setWarnings(initialWarnings);
    setSaveStatus(null);
  };

  return (
    <div className="space-y-6">
      <ConfigWarnings warnings={warnings} bootstrapped={bootstrapped} />

      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="chains">
            Chains ({Object.keys(config.chains).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <GlobalSettings
            etherscanApiKey={config.etherscanApiKey}
            defaults={config.defaults}
            onEtherscanApiKeyChange={(value) =>
              setConfig({ ...config, etherscanApiKey: value })
            }
            onDefaultsChange={(defaults) =>
              setConfig({ ...config, defaults })
            }
          />
        </TabsContent>

        <TabsContent value="chains" className="mt-6">
          <ChainList
            chains={config.chains}
            onChainsChange={(chains) => setConfig({ ...config, chains })}
          />
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <div className="flex items-center gap-4">
          {saveStatus && (
            <p
              className={
                saveStatus.type === "success"
                  ? "text-green-600 text-sm"
                  : "text-red-600 text-sm"
              }
            >
              {saveStatus.message}
            </p>
          )}
          {hasChanges && !saveStatus && (
            <p className="text-gray-500 text-sm">You have unsaved changes</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </div>
    </div>
  );
}
