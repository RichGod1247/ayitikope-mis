// src/lib/security/clamavInstream.ts

import { createHash } from "node:crypto";
import {
  createConnection,
  type Socket,
} from "node:net";

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_PROTOCOL_CHUNK_BYTES =
  256 * 1024;
const DEFAULT_MAX_REPLY_BYTES = 4_096;

export type ClamavEndpoint =
  | {
      kind: "tcp";
      host: string;
      port: number;
    }
  | {
      kind: "unix";
      path: string;
    };

export type ClamavScanResult =
  | {
      verdict: "CLEAN";
      engine: "CLAMAV_CLAMD";
      bytesScanned: number;
      sha256Hash: string;
      rawReply: string;
    }
  | {
      verdict: "INFECTED";
      engine: "CLAMAV_CLAMD";
      threat: string;
      bytesScanned: number;
      sha256Hash: string;
      rawReply: string;
    };

export class ClamavAdapterError
  extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ClamavAdapterError";
    this.code = code;
  }
}

function cleanText(
  value: unknown,
  maxLength: number,
) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function positiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Math.trunc(
    Number(value ?? fallback),
  );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(
    minimum,
    Math.min(maximum, parsed),
  );
}

function normalizeSha256(value: unknown) {
  const hash = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new ClamavAdapterError(
      "EXPECTED_SHA256_INVALID",
      "Expected SHA-256 hash is invalid.",
    );
  }

  return hash;
}

function normalizeEndpoint(
  endpoint: ClamavEndpoint,
): ClamavEndpoint {
  if (endpoint.kind === "unix") {
    const path = String(
      endpoint.path ?? "",
    ).trim();

    if (!path) {
      throw new ClamavAdapterError(
        "CLAMAV_SOCKET_PATH_REQUIRED",
        "ClamAV Unix socket path is required.",
      );
    }

    return {
      kind: "unix",
      path,
    };
  }

  const host = String(
    endpoint.host ?? "",
  ).trim();

  const port = Number(endpoint.port);

  if (!host) {
    throw new ClamavAdapterError(
      "CLAMAV_HOST_REQUIRED",
      "ClamAV host is required.",
    );
  }

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    throw new ClamavAdapterError(
      "CLAMAV_PORT_INVALID",
      "ClamAV port is invalid.",
    );
  }

  return {
    kind: "tcp",
    host,
    port,
  };
}

function connectSocket(
  endpoint: ClamavEndpoint,
  timeoutMs: number,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      endpoint.kind === "unix"
        ? createConnection({
            path: endpoint.path,
          })
        : createConnection({
            host: endpoint.host,
            port: endpoint.port,
          });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();

      reject(
        new ClamavAdapterError(
          "CLAMAV_CONNECT_TIMEOUT",
          "Timed out while connecting to ClamAV.",
        ),
      );
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener(
        "error",
        onError,
      );
      socket.removeListener(
        "connect",
        onConnect,
      );
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();

      reject(
        new ClamavAdapterError(
          "CLAMAV_CONNECT_FAILED",
          "Could not connect to ClamAV.",
        ),
      );
    };

    const onConnect = () => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.setNoDelay(true);
      resolve(socket);
    };

    socket.once("error", onError);
    socket.once("connect", onConnect);
  });
}

function writeSocket(
  socket: Socket,
  value: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(
      value,
      (error?: Error | null) => {
        if (error) {
          reject(
            new ClamavAdapterError(
              "CLAMAV_SOCKET_WRITE_FAILED",
              "Could not write to the ClamAV socket.",
            ),
          );
          return;
        }

        resolve();
      },
    );
  });
}

function readNullTerminatedReply(
  socket: Socket,
  args: {
    timeoutMs: number;
    maxReplyBytes: number;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const timer = setTimeout(() => {
      fail(
        new ClamavAdapterError(
          "CLAMAV_REPLY_TIMEOUT",
          "Timed out while waiting for the ClamAV reply.",
        ),
      );
    }, args.timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("end", onEnd);
      socket.removeListener(
        "close",
        onClose,
      );
      socket.removeListener(
        "error",
        onError,
      );
    };

    const succeed = (reply: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(reply);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onData = (value: Buffer) => {
      const terminator =
        value.indexOf(0);

      const useful =
        terminator >= 0
          ? value.subarray(0, terminator)
          : value;

      total += useful.length;

      if (total > args.maxReplyBytes) {
        fail(
          new ClamavAdapterError(
            "CLAMAV_REPLY_TOO_LARGE",
            "ClamAV reply exceeded the permitted size.",
          ),
        );
        return;
      }

      if (useful.length) {
        chunks.push(Buffer.from(useful));
      }

      if (terminator >= 0) {
        succeed(
          Buffer.concat(chunks, total)
            .toString("utf8")
            .trim(),
        );
      }
    };

    const onEnd = () => {
      fail(
        new ClamavAdapterError(
          "CLAMAV_REPLY_INCOMPLETE",
          "ClamAV closed the connection before terminating its reply.",
        ),
      );
    };

    const onClose = () => {
      if (!settled) {
        onEnd();
      }
    };

    const onError = () => {
      fail(
        new ClamavAdapterError(
          "CLAMAV_SOCKET_READ_FAILED",
          "Could not read the ClamAV reply.",
        ),
      );
    };

    socket.on("data", onData);
    socket.once("end", onEnd);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}

async function simpleCommand(args: {
  endpoint: ClamavEndpoint;
  command: "PING" | "VERSION";
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  maxReplyBytes?: number;
}) {
  const endpoint = normalizeEndpoint(
    args.endpoint,
  );

  const connectTimeoutMs = positiveInteger(
    args.connectTimeoutMs,
    DEFAULT_CONNECT_TIMEOUT_MS,
    500,
    30_000,
  );

  const commandTimeoutMs = positiveInteger(
    args.commandTimeoutMs,
    DEFAULT_COMMAND_TIMEOUT_MS,
    1_000,
    120_000,
  );

  const maxReplyBytes = positiveInteger(
    args.maxReplyBytes,
    DEFAULT_MAX_REPLY_BYTES,
    64,
    64 * 1024,
  );

  const socket = await connectSocket(
    endpoint,
    connectTimeoutMs,
  );

  const replyPromise =
    readNullTerminatedReply(socket, {
      timeoutMs: commandTimeoutMs,
      maxReplyBytes,
    });

  // Mark the promise as observed while writes are in progress.
  void replyPromise.catch(() => undefined);

  try {
    await writeSocket(
      socket,
      Buffer.from(
        `z${args.command}\0`,
        "utf8",
      ),
    );

    return await replyPromise;
  } finally {
    socket.destroy();
  }
}

export async function pingClamav(args: {
  endpoint: ClamavEndpoint;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
}) {
  const reply = await simpleCommand({
    ...args,
    command: "PING",
  });

  if (reply !== "PONG") {
    throw new ClamavAdapterError(
      "CLAMAV_PING_UNEXPECTED_REPLY",
      "ClamAV did not return PONG.",
    );
  }

  return {
    ok: true as const,
    reply,
  };
}

export async function readClamavVersion(args: {
  endpoint: ClamavEndpoint;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
}) {
  const reply = cleanText(
    await simpleCommand({
      ...args,
      command: "VERSION",
      maxReplyBytes: 2_048,
    }),
    160,
  );

  if (!reply) {
    throw new ClamavAdapterError(
      "CLAMAV_VERSION_EMPTY",
      "ClamAV returned an empty version reply.",
    );
  }

  return reply;
}

export function parseClamavInstreamReply(
  value: unknown,
):
  | {
      verdict: "CLEAN";
      rawReply: string;
    }
  | {
      verdict: "INFECTED";
      threat: string;
      rawReply: string;
    } {
  const reply = cleanText(value, 4_096);

  if (reply === "stream: OK") {
    return {
      verdict: "CLEAN",
      rawReply: reply,
    };
  }

  const infected =
    /^stream:\s+(.+?)\s+FOUND$/i.exec(
      reply,
    );

  if (infected) {
    const threat = cleanText(
      infected[1],
      255,
    );

    if (!threat) {
      throw new ClamavAdapterError(
        "CLAMAV_THREAT_NAME_EMPTY",
        "ClamAV reported infection without a threat name.",
      );
    }

    return {
      verdict: "INFECTED",
      threat,
      rawReply: reply,
    };
  }

  if (
    /\bERROR$/i.test(reply) ||
    /INSTREAM size limit exceeded/i.test(
      reply,
    )
  ) {
    throw new ClamavAdapterError(
      "CLAMAV_SCAN_ERROR",
      "ClamAV could not produce a trustworthy scan verdict.",
    );
  }

  throw new ClamavAdapterError(
    "CLAMAV_UNEXPECTED_REPLY",
    "ClamAV returned an unrecognized scan reply.",
  );
}

/**
 * Streams an object through ClamAV's zINSTREAM protocol.
 *
 * The source is never collected into one application buffer.
 */
export async function scanClamavInstream(
  args: {
    endpoint: ClamavEndpoint;
    source: AsyncIterable<Uint8Array>;

    maxBytes: number;
    expectedSizeBytes: number;
    expectedSha256: string;

    connectTimeoutMs?: number;
    commandTimeoutMs?: number;
    protocolChunkBytes?: number;
    maxReplyBytes?: number;
  },
): Promise<ClamavScanResult> {
  const endpoint = normalizeEndpoint(
    args.endpoint,
  );

  const maxBytes = positiveInteger(
    args.maxBytes,
    1,
    1,
    64 * 1024 * 1024,
  );

  const expectedSizeBytes =
    positiveInteger(
      args.expectedSizeBytes,
      1,
      1,
      maxBytes,
    );

  if (expectedSizeBytes > maxBytes) {
    throw new ClamavAdapterError(
      "EXPECTED_SIZE_EXCEEDS_LIMIT",
      "Expected source size exceeds the scan limit.",
    );
  }

  const expectedSha256 =
    normalizeSha256(args.expectedSha256);

  const connectTimeoutMs = positiveInteger(
    args.connectTimeoutMs,
    DEFAULT_CONNECT_TIMEOUT_MS,
    500,
    30_000,
  );

  const commandTimeoutMs = positiveInteger(
    args.commandTimeoutMs,
    DEFAULT_COMMAND_TIMEOUT_MS,
    1_000,
    180_000,
  );

  const protocolChunkBytes =
    positiveInteger(
      args.protocolChunkBytes,
      DEFAULT_PROTOCOL_CHUNK_BYTES,
      4 * 1024,
      1024 * 1024,
    );

  const maxReplyBytes = positiveInteger(
    args.maxReplyBytes,
    DEFAULT_MAX_REPLY_BYTES,
    64,
    64 * 1024,
  );

  const socket = await connectSocket(
    endpoint,
    connectTimeoutMs,
  );

  const replyPromise =
    readNullTerminatedReply(socket, {
      timeoutMs: commandTimeoutMs,
      maxReplyBytes,
    });

  void replyPromise.catch(() => undefined);

  const hash = createHash("sha256");
  let total = 0;

  try {
    await writeSocket(
      socket,
      Buffer.from("zINSTREAM\0", "utf8"),
    );

    for await (const value of args.source) {
      const sourceChunk =
        Buffer.from(value);

      for (
        let offset = 0;
        offset < sourceChunk.length;
        offset += protocolChunkBytes
      ) {
        const chunk = sourceChunk.subarray(
          offset,
          Math.min(
            sourceChunk.length,
            offset + protocolChunkBytes,
          ),
        );

        if (!chunk.length) continue;

        const nextTotal =
          total + chunk.length;

        if (nextTotal > maxBytes) {
          throw new ClamavAdapterError(
            "SOURCE_SIZE_LIMIT_EXCEEDED",
            "Source exceeded the permitted malware scan size.",
          );
        }

        total = nextTotal;
        hash.update(chunk);

        const frame = Buffer.allocUnsafe(
          4 + chunk.length,
        );

        frame.writeUInt32BE(
          chunk.length,
          0,
        );

        chunk.copy(frame, 4);

        await writeSocket(socket, frame);
      }
    }

    if (total !== expectedSizeBytes) {
      throw new ClamavAdapterError(
        "SOURCE_SIZE_MISMATCH",
        "Source size did not match the verified attachment size.",
      );
    }

    const sha256Hash =
      hash.digest("hex");

    if (sha256Hash !== expectedSha256) {
      throw new ClamavAdapterError(
        "SOURCE_SHA256_MISMATCH",
        "Source hash did not match the verified attachment hash.",
      );
    }

    // Zero-length frame terminates INSTREAM.
    await writeSocket(
      socket,
      Buffer.alloc(4),
    );

    const parsed =
      parseClamavInstreamReply(
        await replyPromise,
      );

    if (parsed.verdict === "CLEAN") {
      return {
        verdict: "CLEAN",
        engine: "CLAMAV_CLAMD",
        bytesScanned: total,
        sha256Hash,
        rawReply: parsed.rawReply,
      };
    }

    return {
      verdict: "INFECTED",
      engine: "CLAMAV_CLAMD",
      threat: parsed.threat,
      bytesScanned: total,
      sha256Hash,
      rawReply: parsed.rawReply,
    };
  } finally {
    socket.destroy();
  }
}