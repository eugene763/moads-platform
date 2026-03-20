import {PlatformError} from "@moads/db";
import {FastifyReply, FastifyRequest} from "fastify";

export function sendError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof PlatformError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
    return;
  }

  request.log.error({err: error}, "unhandled error");

  reply.status(500).send({
    error: {
      code: "internal_error",
      message: "Internal server error.",
    },
  });
}
