import Fastify from "fastify";

// Minimal server skeleton. The resolver, job API, and KeeperHub audit-trail
// polling land here in Week 1.
const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "recourse-backend" }));

const port = Number(process.env.PORT ?? 3001);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => app.log.info(`recourse-backend listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
