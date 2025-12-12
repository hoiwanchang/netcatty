export class BridgeUnavailableError extends Error {
  constructor(message = "Netcatty bridge unavailable") {
    super(message);
    this.name = "BridgeUnavailableError";
  }
}

export const netcattyBridge = {
  get(): NetcattyBridge | undefined {
    return window.netcatty;
  },

  require(): NetcattyBridge {
    const bridge = window.netcatty;
    if (!bridge) throw new BridgeUnavailableError();
    return bridge;
  },
};

