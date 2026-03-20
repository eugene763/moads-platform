import {describe, expect, it, vi} from "vitest";

import {PlatformError} from "@moads/db";

import {sendError} from "./http-error.js";

function buildReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("sendError", () => {
  it("passes platform errors through unchanged", () => {
    const request = {
      log: {
        error: vi.fn(),
      },
    };
    const reply = buildReply();

    sendError(
      new PlatformError(409, "boom", "Explicit error."),
      request as never,
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: "boom",
        message: "Explicit error.",
        details: null,
      },
    });
  });

  it("returns a stable generic 500 message for unexpected errors", () => {
    const request = {
      log: {
        error: vi.fn(),
      },
    };
    const reply = buildReply();

    sendError(
      new Error("postgres password leaked"),
      request as never,
      reply as never,
    );

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: "internal_error",
        message: "Internal server error.",
      },
    });
    expect(request.log.error).toHaveBeenCalled();
  });
});
