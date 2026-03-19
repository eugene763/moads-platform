import {FastifyInstance} from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    reply.send({
      ok: true,
      service: "moads-api",
    });
  });
}
