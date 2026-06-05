import test from "node:test";
import assert from "node:assert/strict";

import { compactGatewayResponsePayload } from "../cloud/ws-client";

test("gateway keeps screenshot bytes so backend can materialize an artifact", () => {
  const payload = compactGatewayResponsePayload({
    capability_id: "screenshot.capture",
    result: {
      images: [
        {
          monitor_name: "primary",
          width: 12,
          height: 8,
          data_base64: "YWJjZA==",
          base64: "legacy",
          data: "legacy",
        },
      ],
    },
  });

  const result = payload?.result as Record<string, unknown>;
  const images = result.images as Array<Record<string, unknown>>;
  assert.equal(images[0].data_base64, "YWJjZA==");
  assert.equal(images[0].byte_size_estimate, 6);
  assert.equal("base64" in images[0], false);
  assert.equal("data" in images[0], false);
});
