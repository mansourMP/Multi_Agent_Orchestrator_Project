import { loadGatewayConfig } from "./config";
import { GatewayWsClient } from "./cloud/ws-client";
import { resolveDeviceIdentity } from "./pairing/device-identity";
import { GatewayTokenStore } from "./pairing/token-store";
import { GatewayStateDb } from "./state/db";
import { GatewayJournal } from "./state/journal";
import { GatewayOutbox } from "./state/outbox";
import { GatewayCheckpoints } from "./state/checkpoints";
import { buildRuntimeMetadata } from "./runtime/runtime-metadata";
import { GatewaySupervisorClient } from "./supervisor/client";
import { GatewayCapabilityRouter } from "./supervisor/capability-router";
import { WhatsAppPersonalRuntime } from "./channels/whatsapp/runtime";
import { TelegramPersonalRuntime } from "./channels/telegram/runtime";
import { GatewayBrowserWorker } from "./browser/worker";
import { GatewayBrowserRuntime } from "./browser/runtime";

const GATEWAY_VERSION = "0.1.0";

async function main(): Promise<void> {
  const config = loadGatewayConfig();
  const db = new GatewayStateDb(config.stateDir);
  const journal = new GatewayJournal(db);
  const outbox = new GatewayOutbox(db);
  const checkpoints = new GatewayCheckpoints(db);
  const tokenStore = new GatewayTokenStore(db);
  const supervisorClient = new GatewaySupervisorClient(config);
  const browserWorker = new GatewayBrowserWorker(config);
  const browserRuntime = new GatewayBrowserRuntime(db, browserWorker);
  const whatsappRuntime = new WhatsAppPersonalRuntime(db);
  const telegramRuntime = new TelegramPersonalRuntime(db);
  const capabilityRouter = new GatewayCapabilityRouter(
    supervisorClient,
    browserRuntime,
    whatsappRuntime,
    telegramRuntime,
  );
  const identity = await resolveDeviceIdentity(db, {
    gatewayId: config.gatewayId,
    deviceId: config.deviceId,
  });
  const runtimeMetadata = buildRuntimeMetadata(
    GATEWAY_VERSION,
    [
      ...capabilityRouter.supportedCapabilities(),
      ...whatsappRuntime.requestedCapabilities(),
      ...telegramRuntime.requestedCapabilities(),
    ],
  );
  const client = new GatewayWsClient(
    config,
    db,
    journal,
    outbox,
    checkpoints,
    tokenStore,
    capabilityRouter,
    whatsappRuntime,
    telegramRuntime,
  );
  whatsappRuntime.setPublisher(client);
  telegramRuntime.setPublisher(client);

  if (config.pairingToken) {
    await client.registerFromPairing(config.pairingToken, identity, runtimeMetadata);
  } else if (config.gatewayToken) {
    await tokenStore.save({ gatewayToken: config.gatewayToken });
  }

  await journal.append("system", "gateway.process.start", {
    gatewayId: identity.gatewayId,
    deviceId: identity.deviceId,
    stateDir: config.stateDir,
    apiBaseUrl: config.apiBaseUrl,
  });
  await whatsappRuntime.start();
  await telegramRuntime.start();
  await client.run(identity, runtimeMetadata);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
