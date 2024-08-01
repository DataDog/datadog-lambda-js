import { updateDDTags } from "./dd_tags";

describe("updateDDTags", () => {
  it("should work when updating an unset DD_TAGS", async () => {
    expect(process.env.DD_TAGS).toBeUndefined();
    const tags = updateDDTags({ hello: "world" });
    expect(tags).toEqual({ hello: "world" });
  });

  it("should work when updating a valid DD_TAGS", async () => {
    process.env.DD_TAGS = "datadog:bits";
    const tags = updateDDTags({ hello: "world" });
    expect(tags).toEqual({ datadog: "bits", hello: "world" });
  });

  it("should work when updating a valid DD_TAGS and comma at the end", async () => {
    process.env.DD_TAGS = "datadog:bits,";
    const tags = updateDDTags({ hello: "world" });
    expect(tags).toEqual({ datadog: "bits", hello: "world" });
  });
});
