// scripts/clamav-adapter-selftest.ts

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createServer,
  type Socket,
} from "node:net";

import {
  ClamavAdapterError,
  pingClamav,
  readClamavVersion,
  scanClamavInstream,
} from "../src/lib/security/clamavInstream";

function sha256(value: Buffer) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

async function* chunks(value: Buffer) {
  const middle = Math.max(
    1,
    Math.floor(value.length / 2),
  );

  yield value.subarray(0, middle);
  yield value.subarray(middle);
}

function handleConnection(socket: Socket) {
  socket.on("error", () => undefined);

  let buffer = Buffer.alloc(0);
  let mode:
    | "COMMAND"
    | "STREAM"
    | "DONE" = "COMMAND";

  const streamChunks: Buffer[] = [];

  const processBuffer = () => {
    while (true) {
      if (mode === "COMMAND") {
        const terminator =
          buffer.indexOf(0);

        if (terminator < 0) return;

        const command = buffer
          .subarray(0, terminator)
          .toString("utf8");

        buffer = buffer.subarray(
          terminator + 1,
        );

        if (command === "zPING") {
          mode = "DONE";
          socket.end(
            Buffer.from("PONG\0"),
          );
          return;
        }

        if (command === "zVERSION") {
          mode = "DONE";
          socket.end(
            Buffer.from(
              "ClamAV 1.4-test/99999/Test\0",
            ),
          );
          return;
        }

        if (command === "zINSTREAM") {
          mode = "STREAM";
          continue;
        }

        mode = "DONE";
        socket.end(
          Buffer.from(
            "UNKNOWN COMMAND ERROR\0",
          ),
        );
        return;
      }

      if (mode === "STREAM") {
        if (buffer.length < 4) return;

        const length =
          buffer.readUInt32BE(0);

        if (
          buffer.length <
          4 + length
        ) {
          return;
        }

        buffer = buffer.subarray(4);

        if (length === 0) {
          const payload =
            Buffer.concat(
              streamChunks,
            );

          const text =
            payload.toString("utf8");

          const reply = text.includes(
            "infected",
          )
            ? "stream: Eicar-Test-Signature FOUND"
            : text.includes(
                  "scanner-error",
                )
              ? "stream: temporary scanner failure ERROR"
              : "stream: OK";

          mode = "DONE";
          socket.end(
            Buffer.from(`${reply}\0`),
          );
          return;
        }

        streamChunks.push(
          Buffer.from(
            buffer.subarray(0, length),
          ),
        );

        buffer = buffer.subarray(length);
        continue;
      }

      return;
    }
  };

  socket.on("data", (value) => {
    buffer = Buffer.concat([
      buffer,
      value,
    ]);

    processBuffer();
  });
}

async function main() {
  const server = createServer(
    handleConnection,
  );

  await new Promise<void>(
    (resolve, reject) => {
      server.once("error", reject);
      server.listen(
        0,
        "127.0.0.1",
        () => resolve(),
      );
    },
  );

  try {
    const address = server.address();

    assert.ok(
      address &&
        typeof address === "object",
    );

    const endpoint = {
      kind: "tcp" as const,
      host: "127.0.0.1",
      port: address.port,
    };

    const ping = await pingClamav({
      endpoint,
    });

    assert.equal(ping.reply, "PONG");

    const version =
      await readClamavVersion({
        endpoint,
      });

    assert.match(version, /^ClamAV /);

    const cleanPayload =
      Buffer.from("clean-document");

    const clean =
      await scanClamavInstream({
        endpoint,
        source: chunks(cleanPayload),
        maxBytes: 1024,
        expectedSizeBytes:
          cleanPayload.length,
        expectedSha256:
          sha256(cleanPayload),
      });

    assert.equal(
      clean.verdict,
      "CLEAN",
    );

    const infectedPayload =
      Buffer.from(
        "infected-document",
      );

    const infected =
      await scanClamavInstream({
        endpoint,
        source: chunks(
          infectedPayload,
        ),
        maxBytes: 1024,
        expectedSizeBytes:
          infectedPayload.length,
        expectedSha256:
          sha256(infectedPayload),
      });

    assert.equal(
      infected.verdict,
      "INFECTED",
    );

    if (
      infected.verdict === "INFECTED"
    ) {
      assert.equal(
        infected.threat,
        "Eicar-Test-Signature",
      );
    }

    const errorPayload =
      Buffer.from("scanner-error");

    await assert.rejects(
      () =>
        scanClamavInstream({
          endpoint,
          source: chunks(
            errorPayload,
          ),
          maxBytes: 1024,
          expectedSizeBytes:
            errorPayload.length,
          expectedSha256:
            sha256(errorPayload),
        }),
      (error: unknown) =>
        error instanceof
          ClamavAdapterError &&
        error.code ===
          "CLAMAV_SCAN_ERROR",
    );

    const hashMismatchPayload =
      Buffer.from("hash-mismatch");

    await assert.rejects(
      () =>
        scanClamavInstream({
          endpoint,
          source: chunks(
            hashMismatchPayload,
          ),
          maxBytes: 1024,
          expectedSizeBytes:
            hashMismatchPayload.length,
          expectedSha256:
            "0".repeat(64),
        }),
      (error: unknown) =>
        error instanceof
          ClamavAdapterError &&
        error.code ===
          "SOURCE_SHA256_MISMATCH",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          event:
            "CLAMAV_ADAPTER_SELFTEST_PASSED",
          tested: [
            "PING",
            "VERSION",
            "CLEAN",
            "INFECTED",
            "SCANNER_ERROR",
            "SHA256_MISMATCH",
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise<void>(
      (resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      },
    );
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        event:
          "CLAMAV_ADAPTER_SELFTEST_FAILED",
        code:
          error instanceof
          ClamavAdapterError
            ? error.code
            : null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      null,
      2,
    ),
  );

  process.exit(1);
});