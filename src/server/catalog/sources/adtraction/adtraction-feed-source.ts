import { readFile } from "node:fs/promises";
import type { MappingProfile } from "../../mapping/profile";
import type { FetchOptions, ProductSource, SourceFetchResult, SourceIdentity } from "../../types";
import { parseGoogleShoppingFeed } from "../google-shopping-xml";
import { downloadFeed, redactUrl } from "../http";

export interface AdtractionFeedConfig {
  identity: SourceIdentity;
  /** Product feed URL from the Adtraction dashboard (contains the channel token). */
  feedUrl: string | undefined;
  /** Name of the env var holding the URL, for helpful errors. */
  feedUrlEnv: string;
  mapping: MappingProfile;
  defaultCurrency: string;
}

/** An Adtraction product feed: Google Shopping XML over HTTPS. One instance per advertiser. */
export class AdtractionFeedSource implements ProductSource {
  readonly identity: SourceIdentity;
  readonly mapping: MappingProfile;

  constructor(private readonly config: AdtractionFeedConfig) {
    this.identity = config.identity;
    this.mapping = config.mapping;
  }

  async fetch(options: FetchOptions = {}): Promise<SourceFetchResult> {
    const fetchedAt = new Date();

    if (options.filePath) {
      const body = await readFile(options.filePath, "utf8");
      return {
        modified: true,
        rows: parseGoogleShoppingFeed(body, { defaultCurrency: this.config.defaultCurrency }),
        meta: { fetchedAt, bytes: Buffer.byteLength(body), location: options.filePath },
      };
    }

    const url = this.config.feedUrl;
    if (!url) {
      throw new Error(`${this.config.feedUrlEnv} is not set — cannot fetch ${this.identity.key}`);
    }
    const download = await downloadFeed(url, {
      ifModifiedSince: options.ifModifiedSince,
      signal: options.signal,
    });
    const meta = {
      fetchedAt,
      lastModified: download.lastModified,
      bytes: download.bytes,
      location: redactUrl(url),
    };
    if (!download.modified || download.body === undefined) {
      return { modified: false, rows: [], meta };
    }
    return {
      modified: true,
      rows: parseGoogleShoppingFeed(download.body, { defaultCurrency: this.config.defaultCurrency }),
      meta,
    };
  }
}
