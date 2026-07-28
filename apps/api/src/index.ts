import { buildServer } from "./http/server.js";
import { ACME_API_KEY, DEMO_API_KEY, buildDemoRegistry } from "./tenants.js";

const registry = buildDemoRegistry();
const app = buildServer(registry);

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    console.log(`pc-core api listening on ${address}`);
    console.log(`  demo tenant  -- Authorization: Bearer ${DEMO_API_KEY}`);
    console.log(`  acme tenant  -- Authorization: Bearer ${ACME_API_KEY}`);
    console.log(`  register your own: POST /connectors/register {name, policyBaseUrl}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
