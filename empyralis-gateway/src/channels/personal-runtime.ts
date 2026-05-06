import type {
  GatewayChannelInboundPayload,
  GatewayChannelOutboundPayload,
  GatewayRequestEnvelope,
  GatewayScope,
  GatewayToolInvokePayload,
} from "../protocol/types";

export interface PersonalChannelGatewayPublisher {
  publishEvent: (type: "channel.inbound", payload: GatewayChannelInboundPayload) => Promise<void>;
  publishStateUpdate: (payload: Record<string, unknown>) => Promise<void>;
}

export interface PersonalChannelRuntime {
  requestedCapabilities: () => string[];
  supportsCapability: (capabilityId: string) => boolean;
  handleCapabilityInvoke: (
    frame: GatewayRequestEnvelope<GatewayToolInvokePayload>,
  ) => Promise<Record<string, unknown>>;
  supportsChannel: (channelKey: string) => boolean;
  handleChannelOutbound: (
    frame: GatewayRequestEnvelope<GatewayChannelOutboundPayload>,
  ) => Promise<Record<string, unknown>>;
  handleGatewayConnected: (scope: GatewayScope) => Promise<void>;
  handleGatewayDisconnected: (reason: string) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setPublisher?: (publisher: PersonalChannelGatewayPublisher) => void;
}

export class PersonalChannelRuntimeRegistry {
  private readonly runtimes: PersonalChannelRuntime[];

  constructor(runtimes: PersonalChannelRuntime[] = []) {
    this.runtimes = [...runtimes];
  }

  all(): PersonalChannelRuntime[] {
    return [...this.runtimes];
  }

  requestedCapabilities(): string[] {
    return this.runtimes.flatMap((runtime) =>
      runtime.requestedCapabilities().filter((capability) => runtime.supportsCapability(capability)),
    );
  }

  runtimeForCapability(capabilityId: string): PersonalChannelRuntime | undefined {
    return this.runtimes.find((runtime) => runtime.supportsCapability(capabilityId));
  }

  runtimeForChannel(channelKey: string): PersonalChannelRuntime | undefined {
    return this.runtimes.find((runtime) => runtime.supportsChannel(channelKey));
  }

  setPublisher(publisher: PersonalChannelGatewayPublisher): void {
    for (const runtime of this.runtimes) {
      runtime.setPublisher?.(publisher);
    }
  }

  async startAll(): Promise<void> {
    for (const runtime of this.runtimes) {
      await runtime.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const runtime of [...this.runtimes].reverse()) {
      await runtime.stop();
    }
  }

  async handleGatewayConnected(scope: GatewayScope): Promise<void> {
    for (const runtime of this.runtimes) {
      await runtime.handleGatewayConnected(scope);
    }
  }

  async handleGatewayDisconnected(reason: string): Promise<void> {
    for (const runtime of this.runtimes) {
      await runtime.handleGatewayDisconnected(reason);
    }
  }
}
