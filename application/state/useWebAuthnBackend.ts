import { useCallback } from "react";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

export const useWebAuthnBackend = () => {
  const hasBrowserWebAuthn = useCallback(() => {
    return !!netcattyBridge.get()?.webauthnCreateCredentialInBrowser;
  }, []);

  const createCredentialInBrowser = useCallback(
    async (options: WebAuthnBrowserCreateOptions) => {
      const bridge = netcattyBridge.get();
      if (!bridge?.webauthnCreateCredentialInBrowser) {
        throw new Error("webauthnCreateCredentialInBrowser unavailable");
      }
      return bridge.webauthnCreateCredentialInBrowser(options);
    },
    [],
  );

  const getAssertionInBrowser = useCallback(
    async (options: WebAuthnBrowserGetOptions) => {
      const bridge = netcattyBridge.get();
      if (!bridge?.webauthnGetAssertionInBrowser) {
        throw new Error("webauthnGetAssertionInBrowser unavailable");
      }
      return bridge.webauthnGetAssertionInBrowser(options);
    },
    [],
  );

  return { hasBrowserWebAuthn, createCredentialInBrowser, getAssertionInBrowser };
};

