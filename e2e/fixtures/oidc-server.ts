import { startMockOidcServer } from "./mock-oidc";
import { MOCK_OIDC_PORT } from "./constants";

await startMockOidcServer({ port: MOCK_OIDC_PORT });
