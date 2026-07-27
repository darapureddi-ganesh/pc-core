import { buildServer } from "./http/server.js";
import { PolicyService } from "./service/policy-service.js";
import { InMemoryPolicyRepository } from "./service/repository.js";

const service = new PolicyService(new InMemoryPolicyRepository());
const app = buildServer(service);

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => console.log(`pc-core api listening on ${address}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
