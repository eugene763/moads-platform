import {PlatformError} from "@moads/db";
import {FastifyReply, FastifyRequest} from "fastify";

export function sendError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof PlatformError) {
    const logPayload = {
      platformErrorCode: error.code,
      platformErrorStatus: error.statusCode,
      details: error.details ?? null,
    };
    if (error.statusCode >= 500) {
      request.log.error(logPayload, "platform error");
    } else {
      request.log.warn(logPayload, "platform error");
    }
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
