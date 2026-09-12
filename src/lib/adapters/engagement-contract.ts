import type { PlatformAdapter, PlatformCapabilities } from "@/types/platform";

/** Maps static platform capability flags to optional adapter method names. */
export const ENGAGEMENT_CAPABILITY_METHODS: Record<
  keyof Pick<
    PlatformCapabilities,
    | "readComments"
    | "writeComments"
    | "replyToComments"
    | "deleteComments"
    | "reactToPosts"
    | "reactToComments"
  >,
  readonly (keyof PlatformAdapter)[]
> = {
  readComments: ["listComments"],
  writeComments: ["createComment"],
  replyToComments: ["replyToComment"],
  deleteComments: ["deleteComment"],
  reactToPosts: ["reactToPost", "unreactToPost"],
  reactToComments: ["reactToComment", "unreactToComment"],
};

export function adapterDeclaresEngagementMethod(
  adapter: PlatformAdapter,
  method: keyof PlatformAdapter,
): boolean {
  return typeof adapter[method] === "function";
}

export function engagementMethodsForCapability(
  capability: keyof typeof ENGAGEMENT_CAPABILITY_METHODS,
): readonly (keyof PlatformAdapter)[] {
  return ENGAGEMENT_CAPABILITY_METHODS[capability];
}
