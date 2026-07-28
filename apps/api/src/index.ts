import { buildServer } from "./http/server.js";
import { buildDemoRegistry } from "./tenants.js";

const registry = buildDemoRegistry();
const app = buildServer(registry);

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => console.log(`pc-core api listening on ${address}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
