import { buildServer } from "./http/server.js";
import { BETA_API_KEY, DEMO_API_KEY, buildDemoRegistry } from "./tenants.js";

const port = Number(process.env.PORT ?? 3000);

buildDemoRegistry()
  .then(async (registry) => {
    const app = buildServer(registry);
    const address = await app.listen({ port, host: "0.0.0.0" });
    console.log(`PC Core api listening on ${address}`);
    console.log(`  demo tenant  -- Authorization: Bearer ${DEMO_API_KEY}`);
    console.log(`  beta tenant  -- Authorization: Bearer ${BETA_API_KEY}`);
    console.log(`  register your own: POST /connectors/register {name, policyBaseUrl}`);
    if (process.env.DATABASE_URL) {
      console.log(`  demo tenant is Postgres-backed (DATABASE_URL set)`);
    }
    if (process.env.LOCAL_LLM_MODEL) {
      console.log(
        `  demo tenant's fraud scoring + IDP extraction run against local model "${process.env.LOCAL_LLM_MODEL}" (LOCAL_LLM_MODEL set)`,
      );
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
