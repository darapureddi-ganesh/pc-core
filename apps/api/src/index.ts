import { buildServer } from "./http/server.js";
import { PolicyService } from "./service/policy-service.js";
import { InMemoryPolicyRepository } from "./service/repository.js";
import { BillingService } from "./service/billing-service.js";
import { InMemoryBillingRepository } from "./service/billing-repository.js";
import { ClaimsService } from "./service/claims-service.js";
import { InMemoryClaimsRepository } from "./service/claims-repository.js";

const policy = new PolicyService(new InMemoryPolicyRepository());
const billing = new BillingService(new InMemoryBillingRepository());
const claims = new ClaimsService(new InMemoryClaimsRepository(), policy);

const app = buildServer({ policy, billing, claims });

const port = Number(process.env.PORT ?? 3000);

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => console.log(`pc-core api listening on ${address}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
